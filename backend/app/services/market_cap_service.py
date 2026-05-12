import logging
from datetime import date
from typing import Optional
from sqlalchemy.orm import Session
from app.models.market_cap import MarketCapCategorizationUpload, MarketCapCategorizationRow
from app.parsers.market_cap_parser import parse_market_cap_excel

logger = logging.getLogger(__name__)


def process_market_cap_file(
    db: Session,
    file_path: str,
    effective_date: Optional[date] = None,
) -> dict:
    """
    Parse and store the AMFI Market Cap Categorization Excel file.

    effective_date is auto-detected from the file title row (e.g. "30 June 2025").
    The explicitly passed effective_date overrides the auto-detected one if provided.
    """
    parsed = parse_market_cap_excel(file_path)

    # Resolve effective date: explicit > auto-detected > error
    resolved_date = effective_date or parsed.get("effective_date")
    if resolved_date is None:
        raise ValueError(
            "Cannot determine effective date. "
            "Pass it explicitly or ensure the file title contains a date "
            "(e.g. 'six months ended 30 June 2025')."
        )

    records = parsed.get("records", [])
    title = parsed.get("title", "")

    # Create upload record
    upload = MarketCapCategorizationUpload(
        effective_date=resolved_date,
        source_filename=file_path,
        title=title,
        status="PROCESSING",
        total_rows=len(records),
    )
    db.add(upload)
    db.flush()

    # Delete any existing rows for the same effective_date to allow re-upload
    db.query(MarketCapCategorizationRow).filter_by(effective_date=resolved_date).delete(
        synchronize_session=False
    )

    # Commit in small batches so each MySQL transaction stays tiny
    # (avoids InnoDB undo-log / tmpdir exhaustion on low-disk servers)
    BATCH_SIZE = 50
    inserted = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        for r in batch:
            db.add(MarketCapCategorizationRow(
                upload_id=upload.id,
                rank_number=r["rank_number"],
                company_name=r["company_name"],
                isin=r.get("isin"),
                bse_symbol=r.get("bse_symbol"),
                bse_market_cap_cr=r.get("bse_market_cap_cr"),
                nse_symbol=r.get("nse_symbol"),
                nse_market_cap_cr=r.get("nse_market_cap_cr"),
                msei_symbol=r.get("msei_symbol"),
                msei_market_cap_cr=r.get("msei_market_cap_cr"),
                avg_market_cap_cr=r.get("avg_market_cap_cr"),
                market_cap_bucket=r["market_cap_bucket"],
                effective_date=resolved_date,
            ))
            inserted += 1
        db.commit()   # commit each batch — keeps individual transactions small

    # Mark upload complete
    upload.status = "PROCESSED"
    db.merge(upload)  # re-attach after batch commits
    db.commit()

    logger.info(
        f"Market cap file processed: {inserted} rows for {resolved_date} "
        f"(upload_id={upload.id})"
    )
    return {
        "upload_id":      upload.id,
        "effective_date": str(resolved_date),
        "title":          title,
        "inserted":       inserted,
        "large_cap":      sum(1 for r in records if r["market_cap_bucket"] == "Large Cap"),
        "mid_cap":        sum(1 for r in records if r["market_cap_bucket"] == "Mid Cap"),
        "small_cap":      sum(1 for r in records if r["market_cap_bucket"] == "Small Cap"),
    }
