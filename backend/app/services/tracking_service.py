import logging
from datetime import date, datetime
from sqlalchemy.orm import Session
from app.models.tracking import TrackingError, TrackingDifference, TrackingSyncLog
from app.parsers.tracking_parser import parse_tracking_error, parse_tracking_difference
from app.utils.http_client import HTTP_SESSION
from app.utils.date_utils import get_ist_now

logger = logging.getLogger(__name__)

TRACKING_ERROR_URL = "https://www.amfiindia.com/api/tracking-error-data?MF_ID=all&strdt={date}"
TRACKING_DIFF_URL = "https://www.amfiindia.com/api/tracking-difference?MF_ID=all&date={date}"


def sync_tracking_error(db: Session, as_of_date: date | None = None) -> dict:
    if as_of_date is None:
        as_of_date = get_ist_now().date().replace(day=1)

    date_str = as_of_date.strftime("%d-%b-%Y")
    log = TrackingSyncLog(data_type="TRACKING_ERROR", status="RUNNING", as_of_date=as_of_date)
    db.add(log)
    db.flush()

    try:
        url = TRACKING_ERROR_URL.format(date=date_str)
        resp = HTTP_SESSION.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict):
            data = data.get("data", data.get("Data", []))

        records = parse_tracking_error(data, as_of_date)
        upserted = _upsert_tracking_error(db, records)

        log.status = "SUCCESS"
        log.records_fetched = len(records)
        log.records_upserted = upserted
        db.commit()
        return {"as_of_date": str(as_of_date), "records": len(records), "upserted": upserted}
    except Exception as e:
        log.status = "FAILED"
        log.message = str(e)
        db.commit()
        raise


def sync_tracking_difference(db: Session, report_month: date | None = None) -> dict:
    if report_month is None:
        today = get_ist_now().date()
        report_month = today.replace(day=1)

    date_str = report_month.strftime("%d-%b-%Y")
    log = TrackingSyncLog(data_type="TRACKING_DIFFERENCE", status="RUNNING", as_of_date=report_month)
    db.add(log)
    db.flush()

    try:
        url = TRACKING_DIFF_URL.format(date=date_str)
        resp = HTTP_SESSION.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict):
            data = data.get("data", data.get("Data", []))

        records = parse_tracking_difference(data, report_month)
        upserted = _upsert_tracking_difference(db, records)

        log.status = "SUCCESS"
        log.records_fetched = len(records)
        log.records_upserted = upserted
        db.commit()
        return {"report_month": str(report_month), "records": len(records), "upserted": upserted}
    except Exception as e:
        log.status = "FAILED"
        log.message = str(e)
        db.commit()
        raise


def _upsert_tracking_error(db: Session, records: list) -> int:
    upserted = 0
    for r in records:
        if not r.get("amfi_code"):
            continue
        existing = db.query(TrackingError).filter_by(
            amfi_code=r["amfi_code"],
            period_type=r.get("period_type"),
            as_of_date=r["as_of_date"]
        ).first()
        if existing:
            for k, v in r.items():
                setattr(existing, k, v)
            existing.synced_at = datetime.utcnow()
        else:
            r["synced_at"] = datetime.utcnow()
            db.add(TrackingError(**r))
            upserted += 1
    db.commit()
    return upserted


def _upsert_tracking_difference(db: Session, records: list) -> int:
    upserted = 0
    for r in records:
        if not r.get("amfi_code"):
            continue
        existing = db.query(TrackingDifference).filter_by(
            amfi_code=r["amfi_code"], report_month=r["report_month"]
        ).first()
        if existing:
            for k, v in r.items():
                setattr(existing, k, v)
            existing.synced_at = datetime.utcnow()
        else:
            r["synced_at"] = datetime.utcnow()
            db.add(TrackingDifference(**r))
            upserted += 1
    db.commit()
    return upserted
