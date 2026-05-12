from fastapi import APIRouter, BackgroundTasks, Depends, Query, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date, timedelta
from app.database import get_db
from app.models.nav import DailyNAV, NavPrice, HistoricalNAVImportBatch
from app.schemas.nav import DailyNAVOut, NavPriceOut, HistoricalNAVBatchOut
from app.schemas.common import PaginatedResponse, MessageResponse
from app.services.nav_service import fetch_daily_nav, fetch_historical_nav_for_date, get_nav_history, fetch_historical_nav_range, bulk_fetch_nav_history, fetch_historical_nav_from_url
from app.utils.file_utils import save_upload

router = APIRouter(prefix="/nav", tags=["NAV"])


@router.get("/daily", response_model=PaginatedResponse[DailyNAVOut])
def list_daily_nav(
    search: Optional[str] = None,
    amfi_code: Optional[str] = None,
    nav_date: Optional[date] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    q = db.query(DailyNAV)
    if amfi_code:
        q = q.filter(DailyNAV.amfi_code == amfi_code)
    if nav_date:
        q = q.filter(DailyNAV.nav_date == nav_date)
    if search:
        q = q.filter(DailyNAV.scheme_name.ilike(f"%{search}%"))

    total = q.count()
    items = q.order_by(DailyNAV.scheme_name).offset((page - 1) * page_size).limit(page_size).all()
    return PaginatedResponse(
        items=items, total=total, page=page,
        page_size=page_size, total_pages=(total + page_size - 1) // page_size
    )


@router.get("/daily/latest-date")
def get_latest_nav_date(db: Session = Depends(get_db)):
    from sqlalchemy import func
    result = db.query(func.max(DailyNAV.nav_date)).scalar()
    return {"latest_nav_date": str(result) if result else None}


@router.post("/sync", response_model=MessageResponse)
def trigger_daily_nav_sync(db: Session = Depends(get_db)):
    result = fetch_daily_nav(db)
    return MessageResponse(message="Daily NAV sync completed", detail=str(result))


@router.get("/{amfi_code}/history", response_model=list[NavPriceOut])
def get_scheme_nav_history(
    amfi_code: str,
    from_date: date = Query(...),
    to_date: date = Query(...),
    db: Session = Depends(get_db),
):
    records = get_nav_history(db, amfi_code, from_date, to_date)
    return records


@router.get("/historical/batches", response_model=PaginatedResponse[HistoricalNAVBatchOut])
def list_historical_batches(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(HistoricalNAVImportBatch).order_by(HistoricalNAVImportBatch.created_at.desc())
    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()
    return PaginatedResponse(
        items=items, total=total, page=page,
        page_size=page_size, total_pages=(total + page_size - 1) // page_size
    )


@router.post("/historical/fetch-date", response_model=MessageResponse)
def fetch_historical_for_date(
    target_date: date = Form(...),
    db: Session = Depends(get_db),
):
    result = fetch_historical_nav_for_date(db, target_date, f"Manual-{target_date}")
    return MessageResponse(message="Historical NAV fetched", detail=str(result))


@router.post("/historical/bulk-fetch-all", response_model=MessageResponse)
def trigger_bulk_nav_history(
    from_year: int = Query(2021, description="Start year (default 2021 for 5Y returns)"),
    to_year: int = Query(None, description="End year inclusive (default: current year)"),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
):
    """
    Bulk-seed NAV history from AMFI year by year (from_year to to_year).
    Runs in the background — returns immediately.
    Skips years that already have >1000 rows in HistoricalNAV.
    Check /nav/historical/batches for per-year progress.
    """
    from app.database import SessionLocal

    def _run():
        bg_db = SessionLocal()
        try:
            bulk_fetch_nav_history(bg_db, from_year=from_year, to_year=to_year)
        finally:
            bg_db.close()

    background_tasks.add_task(_run)
    return MessageResponse(
        message="Bulk NAV history fetch started in background",
        detail=f"Fetching {from_year}–{to_year or 'present'} year by year. Check /nav/historical/batches for progress."
    )


@router.post("/historical/fetch-from-url", response_model=MessageResponse)
def fetch_nav_from_url(
    url: str = Query(..., description="Direct URL to an AMFI-format NAV text file (S3 presigned URL, direct link, etc.)"),
    batch_name: str = Query(None, description="Optional label, defaults to URL hostname+path"),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
):
    """
    Download & import an AMFI-format NAV file from any accessible URL.
    Supports S3 presigned URLs, public direct links, etc.
    Runs in the background — returns immediately.
    Check /nav/historical/batches for status.
    """
    from app.database import SessionLocal

    label = batch_name or f"URL-{url[:80]}"

    def _run():
        bg_db = SessionLocal()
        try:
            fetch_historical_nav_from_url(bg_db, url, label)
        finally:
            bg_db.close()

    background_tasks.add_task(_run)
    return MessageResponse(
        message="NAV fetch from URL started in background",
        detail=f"Downloading from {url[:100]}… Check /nav/historical/batches for status."
    )


@router.post("/historical/fetch-range", response_model=MessageResponse)
def fetch_historical_nav_for_range(
    from_date: date = Query(..., description="Start date (YYYY-MM-DD)"),
    to_date: date = Query(default=None, description="End date (YYYY-MM-DD), defaults to today"),
    db: Session = Depends(get_db),
):
    """
    Fetch historical NAV for a date range in a single AMFI API call.
    AMFI supports: DownloadNAVHistoryReport_Po.aspx?frmdt=01-Jan-2024&todt=31-Dec-2024
    Recommended range: up to 1 year at a time.
    """
    if to_date is None:
        to_date = date.today()
    result = fetch_historical_nav_range(db, from_date, to_date)
    return MessageResponse(message="Historical NAV range fetch completed", detail=str(result))


@router.post("/historical/upload", response_model=MessageResponse)
async def upload_historical_nav_file(
    file: UploadFile = File(...),
    batch_name: str = Form(...),
    db: Session = Depends(get_db),
):
    content = await file.read()
    file_path = save_upload(content, file.filename)
    text_content = content.decode("utf-8", errors="ignore")
    from app.parsers.historical_nav_parser import parse_historical_nav
    from app.models.nav import HistoricalNAV, HistoricalNAVImportBatch
    records = parse_historical_nav(text_content)

    batch = HistoricalNAVImportBatch(
        batch_name=batch_name,
        source_filename=file.filename,
        source_file_type="TXT",
        status="PROCESSING",
        total_rows=len(records),
    )
    db.add(batch)
    db.flush()

    inserted = 0
    for r in records:
        if r.get("nav_date") is None:
            continue
        existing = db.query(HistoricalNAV).filter_by(
            amfi_code=r["amfi_code"], nav_date=r["nav_date"]
        ).first()
        if not existing:
            nav_r = {k: v for k, v in r.items() if k not in ("fund_house", "raw_line")}
            nav_r["import_batch_id"] = batch.id
            db.add(HistoricalNAV(**nav_r))
            inserted += 1

    batch.status = "PROCESSED"
    batch.inserted_rows = inserted
    db.commit()
    return MessageResponse(message=f"Uploaded {len(records)} records, inserted {inserted}")
