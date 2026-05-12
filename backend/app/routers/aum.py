from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models.aum import AverageAumScheme, AverageAumFund, AumSyncLog
from app.schemas.aum import AumSchemeOut, AumFundOut, AumSyncLogOut
from app.schemas.common import PaginatedResponse, MessageResponse
from app.services.aum_service import sync_aum_schemewise, sync_aum_fundwise, bulk_sync_aum

router = APIRouter(prefix="/aum", tags=["AUM"])


@router.get("/scheme-wise", response_model=PaginatedResponse[AumSchemeOut])
def list_aum_scheme(
    fy_id: Optional[int] = None,
    period_id: Optional[int] = None,
    amc_name: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(AverageAumScheme)
    if fy_id:
        q = q.filter(AverageAumScheme.fy_id == fy_id)
    if period_id:
        q = q.filter(AverageAumScheme.period_id == period_id)
    if amc_name:
        q = q.filter(AverageAumScheme.amc_name.ilike(f"%{amc_name}%"))
    if category:
        q = q.filter(AverageAumScheme.scheme_category.ilike(f"%{category}%"))
    if search:
        q = q.filter(AverageAumScheme.scheme_name.ilike(f"%{search}%"))

    total = q.count()
    items = q.order_by(AverageAumScheme.average_aum_cr.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return PaginatedResponse(
        items=items, total=total, page=page,
        page_size=page_size, total_pages=(total + page_size - 1) // page_size
    )


@router.get("/fund-wise", response_model=PaginatedResponse[AumFundOut])
def list_aum_fund(
    fy_id: Optional[int] = None,
    period_id: Optional[int] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(AverageAumFund)
    if fy_id:
        q = q.filter(AverageAumFund.fy_id == fy_id)
    if period_id:
        q = q.filter(AverageAumFund.period_id == period_id)
    if search:
        q = q.filter(AverageAumFund.amc_name.ilike(f"%{search}%"))

    total = q.count()
    items = q.order_by(AverageAumFund.total_aum_cr.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return PaginatedResponse(
        items=items, total=total, page=page,
        page_size=page_size, total_pages=(total + page_size - 1) // page_size
    )


@router.get("/periods")
def list_aum_periods(db: Session = Depends(get_db)):
    from sqlalchemy import distinct
    rows = db.query(
        AverageAumScheme.fy_id,
        AverageAumScheme.period_id,
        AverageAumScheme.fy_label,
        AverageAumScheme.period_label,
    ).distinct().order_by(
        AverageAumScheme.fy_id.desc(),
        AverageAumScheme.period_id.desc()
    ).limit(100).all()
    return [{"fy_id": r.fy_id, "period_id": r.period_id, "fy_label": r.fy_label, "period_label": r.period_label} for r in rows]


@router.get("/sync-logs", response_model=list[AumSyncLogOut])
def list_sync_logs(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    return db.query(AumSyncLog).order_by(AumSyncLog.created_at.desc()).limit(limit).all()


@router.post("/sync/scheme-wise", response_model=MessageResponse)
def trigger_scheme_wise_sync(
    fy_id: int = Query(...),
    period_id: int = Query(...),
    db: Session = Depends(get_db),
):
    result = sync_aum_schemewise(db, fy_id, period_id)
    return MessageResponse(message="AUM scheme-wise sync completed", detail=str(result))


@router.post("/sync/fund-wise", response_model=MessageResponse)
def trigger_fund_wise_sync(
    fy_id: int = Query(...),
    period_id: int = Query(...),
    db: Session = Depends(get_db),
):
    result = sync_aum_fundwise(db, fy_id, period_id)
    return MessageResponse(message="AUM fund-wise sync completed", detail=str(result))


@router.post("/sync/bulk", response_model=MessageResponse)
def trigger_bulk_sync(
    data_type: str = Query("BOTH", description="SCHEME_WISE | FUND_WISE | BOTH"),
    db: Session = Depends(get_db),
):
    """
    Trigger a full historical bulk sync of AUM data across all fyId (1-100) × periodId (1-20).
    Already-synced periods are automatically skipped.
    This is a long-running operation — expect several minutes for a full sync.
    """
    result = bulk_sync_aum(db, data_type=data_type)
    return MessageResponse(message="AUM bulk sync completed", detail=str(result))
