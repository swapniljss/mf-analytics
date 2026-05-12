from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date
from app.database import get_db
from app.models.tracking import TrackingError, TrackingDifference, TrackingSyncLog
from app.schemas.tracking import TrackingErrorOut, TrackingDifferenceOut, TrackingSyncLogOut
from app.schemas.common import PaginatedResponse, MessageResponse
from app.services.tracking_service import sync_tracking_error, sync_tracking_difference

router = APIRouter(prefix="/tracking", tags=["Tracking"])


@router.get("/error", response_model=PaginatedResponse[TrackingErrorOut])
def list_tracking_error(
    amfi_code: Optional[str] = None,
    amc_name: Optional[str] = None,
    period_type: Optional[str] = None,
    as_of_date: Optional[date] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(TrackingError)
    if amfi_code:
        q = q.filter(TrackingError.amfi_code == amfi_code)
    if amc_name:
        q = q.filter(TrackingError.amc_name.ilike(f"%{amc_name}%"))
    if period_type:
        q = q.filter(TrackingError.period_type == period_type)
    if as_of_date:
        q = q.filter(TrackingError.as_of_date == as_of_date)

    total = q.count()
    items = q.order_by(TrackingError.tracking_error.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return PaginatedResponse(
        items=items, total=total, page=page,
        page_size=page_size, total_pages=(total + page_size - 1) // page_size
    )


@router.get("/difference", response_model=PaginatedResponse[TrackingDifferenceOut])
def list_tracking_difference(
    amfi_code: Optional[str] = None,
    amc_name: Optional[str] = None,
    report_month: Optional[date] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(TrackingDifference)
    if amfi_code:
        q = q.filter(TrackingDifference.amfi_code == amfi_code)
    if amc_name:
        q = q.filter(TrackingDifference.amc_name.ilike(f"%{amc_name}%"))
    if report_month:
        q = q.filter(TrackingDifference.report_month == report_month)

    total = q.count()
    items = q.order_by(TrackingDifference.report_month.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return PaginatedResponse(
        items=items, total=total, page=page,
        page_size=page_size, total_pages=(total + page_size - 1) // page_size
    )


@router.get("/{amfi_code}/error-history", response_model=list[TrackingErrorOut])
def get_error_history(amfi_code: str, db: Session = Depends(get_db)):
    return db.query(TrackingError).filter_by(amfi_code=amfi_code).order_by(TrackingError.as_of_date.desc()).all()


@router.get("/{amfi_code}/difference-history", response_model=list[TrackingDifferenceOut])
def get_difference_history(amfi_code: str, db: Session = Depends(get_db)):
    return db.query(TrackingDifference).filter_by(amfi_code=amfi_code).order_by(TrackingDifference.report_month.desc()).all()


@router.get("/sync-logs", response_model=list[TrackingSyncLogOut])
def list_tracking_sync_logs(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    return db.query(TrackingSyncLog).order_by(TrackingSyncLog.created_at.desc()).limit(limit).all()


@router.post("/sync/error", response_model=MessageResponse)
def trigger_te_sync(as_of_date: Optional[date] = None, db: Session = Depends(get_db)):
    result = sync_tracking_error(db, as_of_date)
    return MessageResponse(message="Tracking error sync completed", detail=str(result))


@router.post("/sync/difference", response_model=MessageResponse)
def trigger_td_sync(report_month: Optional[date] = None, db: Session = Depends(get_db)):
    result = sync_tracking_difference(db, report_month)
    return MessageResponse(message="Tracking difference sync completed", detail=str(result))
