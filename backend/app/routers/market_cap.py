from fastapi import APIRouter, Depends, Query, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
from datetime import date
from app.database import get_db
from app.models.market_cap import MarketCapCategorizationUpload, MarketCapCategorizationRow
from app.schemas.common import MessageResponse
from app.services.market_cap_service import process_market_cap_file
from app.utils.file_utils import save_upload

router = APIRouter(prefix="/market-cap", tags=["Market Cap"])


@router.post("/upload", response_model=MessageResponse)
async def upload_market_cap(
    file: UploadFile = File(...),
    effective_date: Optional[str] = Form(
        default=None,
        description="Optional override date (YYYY-MM-DD). Auto-detected from file title if omitted.",
    ),
    db: Session = Depends(get_db),
):
    """
    Upload AMFI Market Cap Categorization Excel file.
    The effective date is auto-parsed from the file's title row
    (e.g. "six months ended 30 June 2025" → 2025-06-30).
    Pass effective_date only to override the auto-detected value.
    """
    content = await file.read()
    file_path = save_upload(content, file.filename)

    # Parse optional override date
    override_date: Optional[date] = None
    if effective_date and effective_date.strip():
        try:
            override_date = date.fromisoformat(effective_date.strip())
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid effective_date format: '{effective_date}'. Use YYYY-MM-DD.")

    try:
        result = process_market_cap_file(db, file_path, override_date)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    msg = (
        f"Processed {result['inserted']} companies for {result['effective_date']} — "
        f"Large Cap: {result['large_cap']}, Mid Cap: {result['mid_cap']}, "
        f"Small Cap: {result['small_cap']}"
    )
    return MessageResponse(message=msg, detail=str(result))


@router.get("/uploads")
def list_uploads(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(MarketCapCategorizationUpload).order_by(
        desc(MarketCapCategorizationUpload.effective_date)
    )
    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": [
            {
                "id": i.id,
                "effective_date": str(i.effective_date),
                "title": i.title,
                "source_filename": i.source_filename,
                "status": i.status,
                "total_rows": i.total_rows,
                "created_at": str(i.created_at) if i.created_at else None,
            }
            for i in items
        ],
        "total": total,
    }


@router.get("/rows")
def list_rows(
    upload_id: Optional[int] = None,
    isin: Optional[str] = None,
    bucket: Optional[str] = None,
    effective_date: Optional[date] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(MarketCapCategorizationRow)
    if upload_id:
        q = q.filter_by(upload_id=upload_id)
    if isin:
        q = q.filter(MarketCapCategorizationRow.isin == isin)
    if bucket:
        q = q.filter(MarketCapCategorizationRow.market_cap_bucket == bucket)
    if effective_date:
        q = q.filter(MarketCapCategorizationRow.effective_date == effective_date)
    if search:
        q = q.filter(MarketCapCategorizationRow.company_name.ilike(f"%{search}%"))

    total = q.count()
    items = (
        q.order_by(MarketCapCategorizationRow.rank_number)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "items": [
            {
                "id": r.id,
                "rank_number": r.rank_number,
                "company_name": r.company_name,
                "isin": r.isin,
                "bse_symbol": r.bse_symbol,
                "nse_symbol": r.nse_symbol,
                "avg_market_cap_cr": float(r.avg_market_cap_cr) if r.avg_market_cap_cr else None,
                "market_cap_bucket": r.market_cap_bucket,
                "effective_date": str(r.effective_date) if r.effective_date else None,
            }
            for r in items
        ],
        "total": total,
    }


@router.get("/latest")
def latest_market_cap(
    bucket: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    from sqlalchemy import func
    latest_date = db.query(func.max(MarketCapCategorizationRow.effective_date)).scalar()
    if not latest_date:
        return {"items": [], "total": 0, "effective_date": None}

    q = db.query(MarketCapCategorizationRow).filter_by(effective_date=latest_date)
    if bucket:
        q = q.filter(MarketCapCategorizationRow.market_cap_bucket == bucket)
    if search:
        q = q.filter(MarketCapCategorizationRow.company_name.ilike(f"%{search}%"))

    total = q.count()
    items = (
        q.order_by(MarketCapCategorizationRow.rank_number)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "effective_date": str(latest_date),
        "total": total,
        "items": [
            {
                "id": r.id,
                "rank_number": r.rank_number,
                "company_name": r.company_name,
                "isin": r.isin,
                "bse_symbol": r.bse_symbol,
                "nse_symbol": r.nse_symbol,
                "avg_market_cap_cr": float(r.avg_market_cap_cr) if r.avg_market_cap_cr else None,
                "market_cap_bucket": r.market_cap_bucket,
            }
            for r in items
        ],
    }
