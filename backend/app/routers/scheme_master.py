from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import Optional, List
from pydantic import BaseModel
from app.database import get_db
from app.models.scheme import SchemeMaster, AmcMaster
from app.schemas.scheme import SchemeMasterOut, AmcMasterOut
from app.schemas.common import PaginatedResponse, MessageResponse
from app.services.scheme_master_service import fetch_and_sync_scheme_master


class SchemePatch(BaseModel):
    face_value: Optional[float] = None
    investment_objective: Optional[str] = None
    fund_manager_name: Optional[str] = None
    fund_manager_experience: Optional[str] = None
    alternate_benchmark: Optional[str] = None
    min_investment_amount: Optional[float] = None
    additional_investment_amount: Optional[float] = None
    sip_min_amount: Optional[float] = None
    dividend_frequency: Optional[str] = None
    maturity_type: Optional[str] = None
    exit_load: Optional[str] = None
    entry_load: Optional[str] = None

router = APIRouter(prefix="/scheme-master", tags=["Scheme Master"])


@router.get("", response_model=PaginatedResponse[SchemeMasterOut])
def list_schemes(
    search: Optional[str] = None,
    amc_name: Optional[str] = None,
    category: Optional[str] = None,
    plan_type: Optional[str] = None,
    is_active: Optional[str] = "Y",
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(SchemeMaster)
    if is_active:
        q = q.filter(SchemeMaster.is_active == is_active)
    if search:
        q = q.filter(or_(
            SchemeMaster.scheme_name.ilike(f"%{search}%"),
            SchemeMaster.amfi_code.ilike(f"%{search}%"),
            SchemeMaster.isin_div_payout_growth.ilike(f"%{search}%"),
        ))
    if amc_name:
        q = q.filter(SchemeMaster.amc_name.ilike(f"%{amc_name}%"))
    if category:
        q = q.filter(SchemeMaster.scheme_category.ilike(f"%{category}%"))
    if plan_type:
        q = q.filter(SchemeMaster.plan_type == plan_type)

    total = q.count()
    items = q.order_by(SchemeMaster.scheme_name).offset((page - 1) * page_size).limit(page_size).all()
    return PaginatedResponse(
        items=items, total=total, page=page,
        page_size=page_size, total_pages=(total + page_size - 1) // page_size
    )


@router.get("/amcs", response_model=List[str])
def list_amcs(db: Session = Depends(get_db)):
    rows = db.query(SchemeMaster.amc_name).filter(
        SchemeMaster.is_active == "Y", SchemeMaster.amc_name.isnot(None)
    ).distinct().order_by(SchemeMaster.amc_name).all()
    return [r[0] for r in rows]


@router.get("/categories", response_model=List[str])
def list_categories(db: Session = Depends(get_db)):
    rows = db.query(SchemeMaster.scheme_category).filter(
        SchemeMaster.scheme_category.isnot(None)
    ).distinct().order_by(SchemeMaster.scheme_category).all()
    return [r[0] for r in rows]


@router.get("/{amfi_code}", response_model=SchemeMasterOut)
def get_scheme(amfi_code: str, db: Session = Depends(get_db)):
    scheme = db.query(SchemeMaster).filter_by(amfi_code=amfi_code).first()
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")
    return scheme


@router.patch("/{amfi_code}", response_model=MessageResponse)
def patch_scheme(amfi_code: str, patch: SchemePatch, db: Session = Depends(get_db)):
    scheme = db.query(SchemeMaster).filter_by(amfi_code=amfi_code).first()
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")
    for field, value in patch.model_dump(exclude_none=True).items():
        setattr(scheme, field, value)
    db.commit()
    return MessageResponse(message=f"Updated metadata for {amfi_code}")


@router.post("/sync", response_model=MessageResponse)
def trigger_sync(db: Session = Depends(get_db)):
    result = fetch_and_sync_scheme_master(db)
    return MessageResponse(message="Sync completed", detail=str(result))


@router.get("/amc-master/list", response_model=PaginatedResponse[AmcMasterOut])
def list_amc_master(
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(AmcMaster)
    if search:
        q = q.filter(AmcMaster.amc_name.ilike(f"%{search}%"))
    total = q.count()
    items = q.order_by(AmcMaster.amc_name).offset((page - 1) * page_size).limit(page_size).all()
    return PaginatedResponse(
        items=items, total=total, page=page,
        page_size=page_size, total_pages=(total + page_size - 1) // page_size
    )
