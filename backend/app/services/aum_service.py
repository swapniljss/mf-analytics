import logging
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.aum import AverageAumScheme, AverageAumFund, AumSyncLog
from app.parsers.aum_api_parser import parse_aum_schemewise, parse_aum_fundwise
from app.utils.http_client import HTTP_SESSION

logger = logging.getLogger(__name__)

AUM_SCHEME_URL = (
    "https://www.amfiindia.com/api/average-aum-schemewise"
    "?strType=Categorywise&fyId={fy_id}&periodId={period_id}&MF_ID=0"
)
AUM_FUND_URL = (
    "https://www.amfiindia.com/api/average-aum-fundwise"
    "?fyId={fy_id}&periodId={period_id}"
)

# AMFI uses fyId 1–100 and periodId 1–20 (not all combinations exist)
FY_ID_RANGE    = range(1, 101)
PERIOD_ID_RANGE = range(1, 21)


# ---------------------------------------------------------------------------
# Single-period syncs
# ---------------------------------------------------------------------------

def sync_aum_schemewise(db: Session, fy_id: int, period_id: int) -> dict:
    """Fetch and upsert scheme-wise AUM for a single (fyId, periodId)."""
    existing_log = db.query(AumSyncLog).filter_by(
        data_type="SCHEME_WISE", fy_id=fy_id, period_id=period_id, status="SUCCESS"
    ).first()
    if existing_log:
        return {"status": "skipped", "reason": "already synced"}

    log = AumSyncLog(data_type="SCHEME_WISE", fy_id=fy_id, period_id=period_id, status="RUNNING")
    db.add(log)
    db.flush()

    try:
        url = AUM_SCHEME_URL.format(fy_id=fy_id, period_id=period_id)
        resp = HTTP_SESSION.get(url, timeout=30)
        resp.raise_for_status()
        payload = resp.json()

        # API always returns a dict wrapper
        if not isinstance(payload, dict):
            raise ValueError(f"Unexpected scheme-wise payload type: {type(payload)}")

        data = payload.get("data", [])
        selected_period = payload.get("selectedPeriod") or None

        # data must be a list; some periods return empty list — that's fine
        if not isinstance(data, list):
            raise ValueError(f"'data' field is not a list: {type(data)}")

        if not data:
            log.status = "SUCCESS"
            log.records_fetched = 0
            log.records_upserted = 0
            db.commit()
            return {"fy_id": fy_id, "period_id": period_id, "records": 0, "upserted": 0,
                    "note": "empty period"}

        records = parse_aum_schemewise(data, fy_id, period_id, selected_period)
        upserted = _upsert_aum_scheme(db, records)

        log.status = "SUCCESS"
        log.records_fetched = len(records)
        log.records_upserted = upserted
        log.message = selected_period
        db.commit()
        logger.info(f"Scheme-wise AUM fyId={fy_id} periodId={period_id}: "
                    f"{len(records)} records, {upserted} new — {selected_period}")
        return {"fy_id": fy_id, "period_id": period_id, "records": len(records),
                "upserted": upserted, "period_label": selected_period}

    except Exception as e:
        log.status = "FAILED"
        log.message = str(e)[:500]
        db.commit()
        logger.error(f"Scheme-wise AUM sync failed fyId={fy_id} periodId={period_id}: {e}")
        raise


def sync_aum_fundwise(db: Session, fy_id: int, period_id: int) -> dict:
    """Fetch and upsert fund-wise AUM for a single (fyId, periodId)."""
    existing_log = db.query(AumSyncLog).filter_by(
        data_type="FUND_WISE", fy_id=fy_id, period_id=period_id, status="SUCCESS"
    ).first()
    if existing_log:
        return {"status": "skipped", "reason": "already synced"}

    log = AumSyncLog(data_type="FUND_WISE", fy_id=fy_id, period_id=period_id, status="RUNNING")
    db.add(log)
    db.flush()

    try:
        url = AUM_FUND_URL.format(fy_id=fy_id, period_id=period_id)
        resp = HTTP_SESSION.get(url, timeout=30)
        resp.raise_for_status()
        payload = resp.json()

        if not isinstance(payload, dict):
            raise ValueError(f"Unexpected fund-wise payload type: {type(payload)}")

        data = payload.get("data", [])
        selected_period = payload.get("selectedPeriod") or None

        if not isinstance(data, list):
            raise ValueError(f"'data' field is not a list: {type(data)}")

        if not data:
            log.status = "SUCCESS"
            log.records_fetched = 0
            log.records_upserted = 0
            db.commit()
            return {"fy_id": fy_id, "period_id": period_id, "records": 0, "upserted": 0,
                    "note": "empty period"}

        records = parse_aum_fundwise(data, fy_id, period_id, selected_period)
        upserted = _upsert_aum_fund(db, records)

        log.status = "SUCCESS"
        log.records_fetched = len(records)
        log.records_upserted = upserted
        log.message = selected_period
        db.commit()
        logger.info(f"Fund-wise AUM fyId={fy_id} periodId={period_id}: "
                    f"{len(records)} records, {upserted} new — {selected_period}")
        return {"fy_id": fy_id, "period_id": period_id, "records": len(records),
                "upserted": upserted, "period_label": selected_period}

    except Exception as e:
        log.status = "FAILED"
        log.message = str(e)[:500]
        db.commit()
        logger.error(f"Fund-wise AUM sync failed fyId={fy_id} periodId={period_id}: {e}")
        raise


# ---------------------------------------------------------------------------
# Bulk historical sync (fyId 1-100 × periodId 1-20)
# ---------------------------------------------------------------------------

def bulk_sync_aum(db: Session, data_type: str = "BOTH") -> dict:
    """
    Iterate over all known fyId/periodId combinations and sync.
    data_type: "SCHEME_WISE" | "FUND_WISE" | "BOTH"
    Skips already-synced periods automatically.
    Returns a summary dict.
    """
    total_scheme_records = 0
    total_fund_records = 0
    skipped = 0
    failed = 0
    empty = 0

    do_scheme = data_type in ("SCHEME_WISE", "BOTH")
    do_fund   = data_type in ("FUND_WISE",   "BOTH")

    for fy_id in FY_ID_RANGE:
        for period_id in PERIOD_ID_RANGE:
            if do_scheme:
                try:
                    result = sync_aum_schemewise(db, fy_id, period_id)
                    if result.get("status") == "skipped":
                        skipped += 1
                    elif result.get("note") == "empty period":
                        empty += 1
                    else:
                        total_scheme_records += result.get("records", 0)
                except Exception:
                    failed += 1

            if do_fund:
                try:
                    result = sync_aum_fundwise(db, fy_id, period_id)
                    if result.get("status") == "skipped":
                        skipped += 1
                    elif result.get("note") == "empty period":
                        empty += 1
                    else:
                        total_fund_records += result.get("records", 0)
                except Exception:
                    failed += 1

    summary = {
        "scheme_records_synced": total_scheme_records,
        "fund_records_synced":   total_fund_records,
        "periods_skipped":       skipped,
        "periods_empty":         empty,
        "periods_failed":        failed,
    }
    logger.info(f"Bulk AUM sync complete: {summary}")
    return summary


# ---------------------------------------------------------------------------
# Upsert helpers
# ---------------------------------------------------------------------------

def _upsert_aum_scheme(db: Session, records: list) -> int:
    upserted = 0
    for r in records:
        if not r.get("amfi_code"):
            continue
        existing = db.query(AverageAumScheme).filter_by(
            fy_id=r["fy_id"], period_id=r["period_id"], amfi_code=r["amfi_code"]
        ).first()
        if existing:
            for k, v in r.items():
                setattr(existing, k, v)
            existing.synced_at = datetime.utcnow()
        else:
            r["synced_at"] = datetime.utcnow()
            db.add(AverageAumScheme(**r))
            upserted += 1
    db.flush()
    return upserted


def _upsert_aum_fund(db: Session, records: list) -> int:
    upserted = 0
    for r in records:
        if not r.get("amc_name"):
            continue
        existing = db.query(AverageAumFund).filter_by(
            fy_id=r["fy_id"], period_id=r["period_id"], amc_name=r["amc_name"]
        ).first()
        if existing:
            for k, v in r.items():
                setattr(existing, k, v)
            existing.synced_at = datetime.utcnow()
        else:
            r["synced_at"] = datetime.utcnow()
            db.add(AverageAumFund(**r))
            upserted += 1
    db.flush()
    return upserted
