import logging
from datetime import date, timedelta
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.models.nav import DailyNAV, NavPrice, HistoricalNAV, HistoricalNAVImportBatch
from app.parsers.nav_all_parser import parse_nav_all
from app.parsers.historical_nav_parser import parse_historical_nav
from app.utils.http_client import HTTP_SESSION
from app.utils.date_utils import get_trading_date_for_nav, parse_amfi_date

logger = logging.getLogger(__name__)

DAILY_NAV_URL = "https://portal.amfiindia.com/spages/NAVAll.txt"
HISTORICAL_NAV_URL = "https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt={date}"
HISTORICAL_NAV_RANGE_URL = "https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt={from_date}&todt={to_date}"

# ── INSERT templates ───────────────────────────────────────────────────────────

_DAILY_UPSERT_SQL = text("""
    INSERT INTO daily_nav
      (amfi_code, isin_div_payout_growth, isin_div_reinvestment,
       scheme_name, nav, repurchase_price, sale_price,
       nav_date, fund_house, raw_line)
    VALUES
      (:amfi_code, :isin_div_payout_growth, :isin_div_reinvestment,
       :scheme_name, :nav, :repurchase_price, :sale_price,
       :nav_date, :fund_house, :raw_line)
    ON DUPLICATE KEY UPDATE
      isin_div_payout_growth = VALUES(isin_div_payout_growth),
      isin_div_reinvestment  = VALUES(isin_div_reinvestment),
      scheme_name            = VALUES(scheme_name),
      nav                    = VALUES(nav),
      repurchase_price       = VALUES(repurchase_price),
      sale_price             = VALUES(sale_price),
      fund_house             = VALUES(fund_house),
      raw_line               = VALUES(raw_line)
""")

_HIST_UPSERT_SQL = text("""
    INSERT INTO historical_nav
      (import_batch_id, amfi_code, isin_div_payout_growth, isin_div_reinvestment,
       scheme_name, nav, repurchase_price, sale_price, nav_date)
    VALUES
      (:import_batch_id, :amfi_code, :isin_div_payout_growth, :isin_div_reinvestment,
       :scheme_name, :nav, :repurchase_price, :sale_price, :nav_date)
    ON DUPLICATE KEY UPDATE
      nav              = VALUES(nav),
      repurchase_price = VALUES(repurchase_price),
      sale_price       = VALUES(sale_price),
      scheme_name      = VALUES(scheme_name)
""")

BATCH = 200   # rows per commit


# ── daily NAV ──────────────────────────────────────────────────────────────────

def fetch_daily_nav(db: Session) -> dict:
    nav_date = get_trading_date_for_nav()
    logger.info(f"Fetching daily NAV for {nav_date}")
    response = HTTP_SESSION.get(DAILY_NAV_URL, timeout=60)
    response.raise_for_status()

    records = parse_nav_all(response.text, nav_date)
    upserted = _upsert_daily_nav(db, records)

    # nav_price is a materialized TABLE (Fix #2), rebuilt nightly at 10 AM IST.
    # When users manually trigger a NAV sync mid-day, also rebuild nav_price so
    # endpoints reading MAX(nav_price.nav_date) — Dashboard's "Latest NAV Date"
    # card and the TopBar pill — reflect today's NAV immediately instead of
    # waiting until the next scheduled rebuild.
    try:
        from app.jobs.scheduler import _run_nav_price_rebuild
        _run_nav_price_rebuild()
    except Exception as e:
        # Non-critical: the NAV data is already committed; only the materialized
        # view is stale. Next 10 AM rebuild will catch up. Log and continue.
        logger.warning(f"Post-sync nav_price rebuild skipped (non-critical): {e}")

    return {"nav_date": str(nav_date), "records": len(records), "inserted": upserted}


def _upsert_daily_nav(db: Session, records: list) -> int:
    """
    Atomic upsert into daily_nav via INSERT ... ON DUPLICATE KEY UPDATE.
    Requires unique index on daily_nav(amfi_code, nav_date).
    nav_price is a materialized TABLE (Fix #2); fetch_daily_nav triggers a
    rebuild after this upsert so reads see fresh data immediately.
    """
    for i in range(0, len(records), BATCH):
        db.execute(_DAILY_UPSERT_SQL, records[i: i + BATCH])
        db.commit()
    return len(records)


# ── historical NAV helpers ─────────────────────────────────────────────────────

def _insert_historical_records(db: Session, records: list, batch_id: int) -> int:
    """
    Bulk-insert historical NAV records into historical_nav.
    Uses INSERT ... ON DUPLICATE KEY UPDATE — safe to re-run.
    nav_price view reflects the data automatically.
    """
    payload = []
    for r in records:
        if r.get("nav_date") is None:
            continue
        payload.append({
            "import_batch_id":         batch_id,
            "amfi_code":               r["amfi_code"],
            "isin_div_payout_growth":  r.get("isin_div_payout_growth"),
            "isin_div_reinvestment":   r.get("isin_div_reinvestment"),
            "scheme_name":             r["scheme_name"],
            "nav":                     r["nav"],
            "repurchase_price":        r.get("repurchase_price"),
            "sale_price":              r.get("sale_price"),
            "nav_date":                r["nav_date"],
        })

    for i in range(0, len(payload), BATCH):
        db.execute(_HIST_UPSERT_SQL, payload[i: i + BATCH])
        db.commit()

    return len(payload)


def _make_batch(db: Session, batch_name: str, source_url: str, total_rows: int) -> HistoricalNAVImportBatch:
    batch = HistoricalNAVImportBatch(
        batch_name=batch_name,
        source_filename=source_url,
        source_file_type="TXT",
        status="PROCESSING",
        total_rows=total_rows,
    )
    db.add(batch)
    db.flush()
    return batch


# ── historical NAV endpoints ───────────────────────────────────────────────────

def fetch_historical_nav_for_date(db: Session, target_date: date, batch_name: str) -> dict:
    date_str = target_date.strftime("%d-%b-%Y")
    url = HISTORICAL_NAV_URL.format(date=date_str)
    logger.info(f"Fetching historical NAV for {date_str}")

    response = HTTP_SESSION.get(url, timeout=120)
    response.raise_for_status()
    records = parse_historical_nav(response.text)

    if not records:
        return {"date": date_str, "records": 0}

    for r in records:
        if r.get("nav_date") is None:
            r["nav_date"] = target_date

    batch = _make_batch(db, batch_name, url, len(records))
    inserted = _insert_historical_records(db, records, batch.id)

    batch.status = "PROCESSED"
    batch.inserted_rows = inserted
    db.merge(batch)
    db.commit()
    return {"date": date_str, "records": len(records), "inserted": inserted}


def fetch_historical_nav_range(db: Session, from_date: date, to_date: date) -> dict:
    """
    Fetch NAVs for a date range in one AMFI call (frmdt + todt).
    Each record carries its own nav_date — multi-date ranges are handled correctly.
    """
    from_str = from_date.strftime("%d-%b-%Y")
    to_str   = to_date.strftime("%d-%b-%Y")
    url = HISTORICAL_NAV_RANGE_URL.format(from_date=from_str, to_date=to_str)
    logger.info(f"Fetching historical NAV range {from_str} → {to_str}")

    response = HTTP_SESSION.get(url, timeout=300)
    response.raise_for_status()
    records = parse_historical_nav(response.text)

    if not records:
        return {"from_date": from_str, "to_date": to_str, "records": 0}

    batch = _make_batch(db, f"Range-{from_date}-{to_date}", url, len(records))
    inserted = _insert_historical_records(db, records, batch.id)

    batch.status = "PROCESSED"
    batch.inserted_rows = inserted
    db.merge(batch)
    db.commit()
    logger.info(f"Historical NAV range: {len(records)} records parsed, {inserted} inserted")
    return {"from_date": from_str, "to_date": to_str, "records": len(records), "inserted": inserted}


def bulk_fetch_nav_history(db: Session, from_year: int = 2021, to_year: int = None, to_date: date = None) -> dict:
    """
    Seed NAV history quarter-by-quarter (avoids AMFI's ~200MB response limit on full-year requests).
    Skips quarters that already have >500 rows in historical_nav.
    """
    from dateutil.relativedelta import relativedelta

    if to_date is None:
        to_date = date.today()
    end_year = to_year if to_year is not None else to_date.year

    total_records = total_inserted = quarters_fetched = quarters_skipped = 0
    errors = []

    chunk_start = date(from_year, 1, 1)
    while chunk_start <= to_date and chunk_start.year <= end_year:
        chunk_end = chunk_start + relativedelta(months=3) - relativedelta(days=1)
        if chunk_end > to_date:
            chunk_end = to_date

        label = f"{chunk_start.year}-Q{((chunk_start.month - 1) // 3) + 1}"

        existing_count = db.query(HistoricalNAV).filter(
            HistoricalNAV.nav_date >= chunk_start,
            HistoricalNAV.nav_date <= chunk_end,
        ).limit(501).count()

        if existing_count > 500:
            logger.info(f"Skipping {label} — already has {existing_count}+ records")
            quarters_skipped += 1
            chunk_start += relativedelta(months=3)
            continue

        try:
            result = fetch_historical_nav_range(db, chunk_start, chunk_end)
            total_records  += result.get("records", 0)
            total_inserted += result.get("inserted", 0)
            quarters_fetched += 1
            logger.info(f"{label}: {result.get('records', 0)} records, {result.get('inserted', 0)} inserted")
        except Exception as e:
            err_msg = f"{label} failed: {e}"
            logger.error(err_msg)
            errors.append(err_msg)

        chunk_start += relativedelta(months=3)

    return {
        "quarters_fetched": quarters_fetched,
        "quarters_skipped": quarters_skipped,
        "total_records":    total_records,
        "total_inserted":   total_inserted,
        "errors":           errors,
    }


def fetch_historical_nav_from_url(db: Session, url: str, batch_name: str) -> dict:
    """Download and import an AMFI-format NAV text file from any URL (S3, direct link, etc.)."""
    logger.info(f"Downloading NAV file from URL: {url}")
    response = HTTP_SESSION.get(url, timeout=300)
    response.raise_for_status()

    records = parse_historical_nav(response.text)
    if not records:
        return {"url": url, "records": 0, "inserted": 0, "error": "No records parsed — check file format"}

    batch = _make_batch(db, batch_name, url, len(records))
    inserted = _insert_historical_records(db, records, batch.id)

    batch.status = "PROCESSED"
    batch.inserted_rows = inserted
    db.merge(batch)
    db.commit()
    logger.info(f"URL fetch complete: {len(records)} parsed, {inserted} inserted — {url[:80]}")
    return {"url": url, "records": len(records), "inserted": inserted}


# ── query ─────────────────────────────────────────────────────────────────────

def get_nav_history(db: Session, amfi_code: str, from_date: date, to_date: date) -> list:
    """Query the nav_price VIEW — transparently reads from daily_nav + historical_nav."""
    return (
        db.query(NavPrice)
        .filter(
            NavPrice.amfi_code == amfi_code,
            NavPrice.nav_date >= from_date,
            NavPrice.nav_date <= to_date,
        )
        .order_by(NavPrice.nav_date)
        .all()
    )
