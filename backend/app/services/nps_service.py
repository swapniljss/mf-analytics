"""
NPS / APY data ingestion and query service.

Ingestion flow:
  parse_nps_zip() → _upsert_pfms() → _upsert_schemes() → _upsert_navs()

Each step is idempotent (INSERT … ON DUPLICATE KEY UPDATE / INSERT IGNORE).
"""

import logging
from datetime import date
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.nps import NPSPfm, NPSScheme, NPSNav
from app.parsers.nps_parser import parse_nps_zip, parse_nps_content

logger = logging.getLogger(__name__)

BATCH = 200   # rows per commit


# ── raw SQL for bulk upserts ──────────────────────────────────────────────────

_PFM_UPSERT = text("""
    INSERT INTO nps_pfm (pfm_code, pfm_name)
    VALUES (:pfm_code, :pfm_name)
    ON DUPLICATE KEY UPDATE pfm_name = VALUES(pfm_name)
""")

_SCHEME_UPSERT = text("""
    INSERT INTO nps_scheme
      (scheme_code, pfm_code, scheme_name,
       asset_class, tier, variant, category, is_apy)
    VALUES
      (:scheme_code, :pfm_code, :scheme_name,
       :asset_class, :tier, :variant, :category, :is_apy)
    ON DUPLICATE KEY UPDATE
      scheme_name = VALUES(scheme_name),
      pfm_code    = VALUES(pfm_code)
""")

_NAV_UPSERT = text("""
    INSERT INTO nps_nav (scheme_code, nav_date, nav)
    VALUES (:scheme_code, :nav_date, :nav)
    ON DUPLICATE KEY UPDATE nav = VALUES(nav)
""")


# ── helpers ───────────────────────────────────────────────────────────────────

def _upsert_pfms(db: Session, records: list[dict]) -> None:
    seen = {}
    for r in records:
        seen[r["pfm_code"]] = r["pfm_name"]
    pfm_rows = [{"pfm_code": k, "pfm_name": v} for k, v in seen.items()]
    if pfm_rows:
        db.execute(_PFM_UPSERT, pfm_rows)
        db.commit()


def _upsert_schemes(db: Session, records: list[dict]) -> None:
    seen = {}
    for r in records:
        if r["scheme_code"] not in seen:
            seen[r["scheme_code"]] = {
                "scheme_code": r["scheme_code"],
                "pfm_code":    r["pfm_code"],
                "scheme_name": r["scheme_name"],
                "asset_class": r["asset_class"],
                "tier":        r["tier"],
                "variant":     r["variant"],
                "category":    r["category"],
                "is_apy":      r["is_apy"],
            }
    scheme_rows = list(seen.values())
    if scheme_rows:
        db.execute(_SCHEME_UPSERT, scheme_rows)
        db.commit()


def _upsert_navs(db: Session, records: list[dict]) -> int:
    nav_rows = [
        {"scheme_code": r["scheme_code"], "nav_date": r["nav_date"], "nav": r["nav"]}
        for r in records
    ]
    for i in range(0, len(nav_rows), BATCH):
        db.execute(_NAV_UPSERT, nav_rows[i: i + BATCH])
        db.commit()
    return len(nav_rows)


# ── public ingest entry points ────────────────────────────────────────────────

def ingest_nps_zip(db: Session, zip_bytes: bytes) -> dict:
    """
    Parse a ZIP file and upsert all NAVs into the DB.
    Returns a summary dict.
    """
    records, filename = parse_nps_zip(zip_bytes)
    if not records:
        return {"filename": filename, "records": 0, "inserted": 0}

    _upsert_pfms(db, records)
    _upsert_schemes(db, records)
    upserted = _upsert_navs(db, records)

    nav_date = records[0]["nav_date"]
    logger.info(f"NPS ingest: {filename} — {upserted} rows for {nav_date}")
    return {
        "filename": filename,
        "nav_date": str(nav_date),
        "records":  len(records),
        "inserted": upserted,
    }


def ingest_nps_text(db: Session, content: str, source_name: str = "manual") -> dict:
    """Parse raw .out file content and upsert."""
    records = parse_nps_content(content)
    if not records:
        return {"source": source_name, "records": 0, "inserted": 0}

    _upsert_pfms(db, records)
    _upsert_schemes(db, records)
    upserted = _upsert_navs(db, records)

    nav_date = records[0]["nav_date"]
    return {
        "source":   source_name,
        "nav_date": str(nav_date),
        "records":  len(records),
        "inserted": upserted,
    }


# ── query helpers ─────────────────────────────────────────────────────────────

def get_nps_nav_history(
    db: Session,
    scheme_code: str,
    from_date: date,
    to_date: date,
) -> list[NPSNav]:
    return (
        db.query(NPSNav)
        .filter(
            NPSNav.scheme_code == scheme_code,
            NPSNav.nav_date >= from_date,
            NPSNav.nav_date <= to_date,
        )
        .order_by(NPSNav.nav_date)
        .all()
    )


def list_pfms(db: Session) -> list[NPSPfm]:
    return db.query(NPSPfm).order_by(NPSPfm.pfm_code).all()


def list_schemes(
    db: Session,
    pfm_code: str | None = None,
    asset_class: str | None = None,
    tier: str | None = None,
    category: str | None = None,
    is_apy: bool | None = None,
) -> list[NPSScheme]:
    q = db.query(NPSScheme).filter(NPSScheme.is_active == 1)
    if pfm_code:
        q = q.filter(NPSScheme.pfm_code == pfm_code)
    if asset_class:
        q = q.filter(NPSScheme.asset_class == asset_class.upper())
    if tier:
        q = q.filter(NPSScheme.tier == tier.upper())
    if category:
        q = q.filter(NPSScheme.category == category.upper())
    if is_apy is not None:
        q = q.filter(NPSScheme.is_apy == (1 if is_apy else 0))
    return q.order_by(NPSScheme.pfm_code, NPSScheme.scheme_code).all()


def get_scheme(db: Session, scheme_code: str) -> NPSScheme | None:
    return db.query(NPSScheme).filter_by(scheme_code=scheme_code).first()
