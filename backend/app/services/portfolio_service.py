import logging
from sqlalchemy.orm import Session
from app.models.portfolio import PortfolioUpload, PortfolioHolding
from app.parsers.portfolio_parser import parse_portfolio_file

logger = logging.getLogger(__name__)


def process_portfolio_file(db: Session, file_path: str, report_month: str) -> dict:
    """Parse and store portfolio holdings. Idempotent: replaces existing rows for same month."""
    parsed = parse_portfolio_file(file_path, report_month)
    records = parsed["records"]

    # Delete existing rows for the same month
    db.query(PortfolioHolding).filter_by(report_month=report_month).delete(synchronize_session=False)

    upload = PortfolioUpload(
        report_month=report_month,
        source_filename=file_path,
        status="PROCESSING",
        total_rows=len(records),
    )
    db.add(upload)
    db.flush()

    for r in records:
        db.add(PortfolioHolding(
            upload_id=upload.id,
            report_month=r["report_month"],
            amfi_code=r["amfi_code"],
            scheme_name=r.get("scheme_name"),
            company_name=r["company_name"],
            company_isin=r.get("company_isin"),
            sector=r.get("sector"),
            quantity=r.get("quantity"),
            market_value_cr=r.get("market_value_cr"),
            percentage_exposure=r.get("percentage_exposure"),
            security_class=r.get("security_class"),
            rating=r.get("rating"),
            rating_agency=r.get("rating_agency"),
            avg_maturity_years=r.get("avg_maturity_years"),
            modified_duration=r.get("modified_duration"),
        ))

    upload.status = "PROCESSED"
    db.commit()

    unique_schemes = len({r["amfi_code"] for r in records})
    logger.info(f"Portfolio: {len(records)} holdings for {report_month} ({unique_schemes} schemes)")
    return {
        "upload_id": upload.id,
        "report_month": report_month,
        "inserted": len(records),
        "unique_schemes": unique_schemes,
    }
