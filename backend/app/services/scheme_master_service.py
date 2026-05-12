import logging
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.scheme import SchemeMaster, AmcMaster
from app.parsers.amfi_scheme_master_parser import parse_scheme_master_text
from app.utils.http_client import HTTP_SESSION

logger = logging.getLogger(__name__)

SCHEME_MASTER_URL = "https://portal.amfiindia.com/DownloadSchemeData_Po.aspx?mf=0"


def fetch_and_sync_scheme_master(db: Session) -> dict:
    logger.info("Fetching scheme master from AMFI portal")
    response = HTTP_SESSION.get(SCHEME_MASTER_URL, timeout=60)
    response.raise_for_status()
    content = response.text

    schemes = parse_scheme_master_text(content)
    logger.info(f"Parsed {len(schemes)} schemes")

    upserted = 0
    for s in schemes:
        existing = db.query(SchemeMaster).filter_by(amfi_code=s["amfi_code"]).first()
        if existing:
            for k, v in s.items():
                setattr(existing, k, v)
            existing.updated_at = datetime.utcnow()
        else:
            db.add(SchemeMaster(**s))
            upserted += 1

    # Mark schemes not in latest fetch as inactive
    active_codes = {s["amfi_code"] for s in schemes}
    db.query(SchemeMaster).filter(
        SchemeMaster.amfi_code.notin_(active_codes),
        SchemeMaster.is_active == "Y"
    ).update({"is_active": "N"}, synchronize_session=False)

    db.commit()
    _rebuild_amc_master(db, schemes)
    return {"schemes_synced": len(schemes), "new_schemes": upserted}


def _rebuild_amc_master(db: Session, schemes: list) -> None:
    amc_counts: dict[str, int] = {}
    for s in schemes:
        amc = s.get("amc_name")
        if amc:
            amc_counts[amc] = amc_counts.get(amc, 0) + 1

    for amc_name, count in amc_counts.items():
        existing = db.query(AmcMaster).filter_by(amc_name=amc_name).first()
        if existing:
            existing.scheme_count = count
            existing.is_active = "Y"
        else:
            db.add(AmcMaster(amc_name=amc_name, scheme_count=count))

    db.commit()
    logger.info(f"AMC master rebuilt with {len(amc_counts)} AMCs")
