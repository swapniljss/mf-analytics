from fastapi import APIRouter, Depends, Query, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
from app.database import get_db
from app.models.dividend import DividendHistory
from app.schemas.common import MessageResponse
from app.utils.file_utils import save_upload

router = APIRouter(prefix="/dividends", tags=["Dividends"])


@router.post("/upload", response_model=MessageResponse)
async def upload_dividends(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload dividend/IDCW history CSV."""
    content = await file.read()
    file_path = save_upload(content, file.filename)
    from app.parsers.dividend_parser import parse_dividend_csv
    try:
        records = parse_dividend_csv(file_path)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    inserted = 0
    for r in records:
        db.add(DividendHistory(**r))
        inserted += 1
    db.commit()
    return MessageResponse(message=f"Inserted {inserted} dividend records")


@router.get("/{amfi_code}")
def get_dividends(
    amfi_code: str,
    dividend_type: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Get dividend/IDCW history for a scheme."""
    q = db.query(DividendHistory).filter_by(amfi_code=amfi_code)
    if dividend_type:
        q = q.filter(DividendHistory.dividend_type == dividend_type)
    if from_date:
        q = q.filter(DividendHistory.record_date >= from_date)
    if to_date:
        q = q.filter(DividendHistory.record_date <= to_date)
    total = q.count()
    items = q.order_by(desc(DividendHistory.record_date)).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "amfi_code": amfi_code,
        "total": total,
        "items": [
            {
                "id": d.id,
                "record_date": str(d.record_date),
                "ex_dividend_date": str(d.ex_dividend_date) if d.ex_dividend_date else None,
                "reinvestment_date": str(d.reinvestment_date) if d.reinvestment_date else None,
                "dividend_per_unit": float(d.dividend_per_unit) if d.dividend_per_unit else None,
                "nav_on_record_date": float(d.nav_on_record_date) if d.nav_on_record_date else None,
                "dividend_yield": float(d.dividend_yield) if d.dividend_yield else None,
                "dividend_type": d.dividend_type,
            }
            for d in items
        ],
    }


@router.get("/{amfi_code}/summary")
def dividend_summary(amfi_code: str, db: Session = Depends(get_db)):
    """Cumulative dividends for 1Y / 3Y / 5Y."""
    from datetime import date, timedelta
    from sqlalchemy import func
    today = date.today()
    def cum(days):
        result = db.query(func.sum(DividendHistory.dividend_per_unit)).filter(
            DividendHistory.amfi_code == amfi_code,
            DividendHistory.record_date >= today - timedelta(days=days),
        ).scalar()
        return float(result) if result else None

    count = db.query(func.count(DividendHistory.id)).filter_by(amfi_code=amfi_code).scalar()
    latest = db.query(DividendHistory).filter_by(amfi_code=amfi_code).order_by(desc(DividendHistory.record_date)).first()
    return {
        "amfi_code": amfi_code,
        "total_dividends_declared": count,
        "latest_record_date": str(latest.record_date) if latest else None,
        "latest_dividend_per_unit": float(latest.dividend_per_unit) if latest and latest.dividend_per_unit else None,
        "cumulative_1y": cum(365),
        "cumulative_3y": cum(1095),
        "cumulative_5y": cum(1825),
    }
