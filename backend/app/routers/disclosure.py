from fastapi import APIRouter, Depends, Query, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date
from app.database import get_db
from app.models.disclosure import (
    MonthlyDisclosureUpload, MonthlyDisclosureRow,
    SubClassificationUpload, SubClassificationRow,
    QuarterlyDisclosureUpload, QuarterlyDisclosureRow,
)
from app.schemas.common import PaginatedResponse, MessageResponse
from app.services.disclosure_service import (
    process_monthly_disclosure, process_sub_classification, process_quarterly_disclosure
)
from app.utils.file_utils import save_upload

router = APIRouter(prefix="/disclosure", tags=["Disclosure"])


# --- Monthly Disclosure ---
@router.post("/monthly/upload", response_model=MessageResponse)
async def upload_monthly_disclosure(
    file: UploadFile = File(...),
    report_month: date = Form(...),
    db: Session = Depends(get_db),
):
    content = await file.read()
    file_path = save_upload(content, file.filename)
    result = process_monthly_disclosure(db, file_path, report_month)
    return MessageResponse(message="Monthly disclosure uploaded", detail=str(result))


@router.get("/monthly/uploads")
def list_monthly_uploads(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(MonthlyDisclosureUpload).order_by(MonthlyDisclosureUpload.report_month.desc())
    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [{"id": i.id, "report_month": str(i.report_month), "source_filename": i.source_filename, "status": i.status, "total_rows": i.total_rows} for i in items], "total": total}


@router.get("/monthly/rows")
def list_monthly_rows(
    upload_id: Optional[int] = None,
    amfi_code: Optional[str] = None,
    amc_name: Optional[str] = None,
    report_month: Optional[date] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(MonthlyDisclosureRow)
    if upload_id:
        q = q.filter_by(upload_id=upload_id)
    if amfi_code:
        q = q.filter_by(amfi_code=amfi_code)
    if amc_name:
        q = q.filter(MonthlyDisclosureRow.amc_name.ilike(f"%{amc_name}%"))
    if report_month:
        q = q.filter_by(report_month=report_month)

    total = q.count()
    items = q.order_by(MonthlyDisclosureRow.aum_cr.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [{"id": r.id, "amfi_code": r.amfi_code, "scheme_name": r.scheme_name, "amc_name": r.amc_name, "aum_cr": str(r.aum_cr), "expense_ratio": str(r.expense_ratio), "report_month": str(r.report_month)} for r in items], "total": total}


# --- Sub Classification ---
@router.post("/sub-classification/upload", response_model=MessageResponse)
async def upload_sub_classification(
    file: UploadFile = File(...),
    report_month: date = Form(...),
    db: Session = Depends(get_db),
):
    content = await file.read()
    file_path = save_upload(content, file.filename)
    result = process_sub_classification(db, file_path, report_month)
    return MessageResponse(message="Sub-classification uploaded", detail=str(result))


@router.get("/sub-classification/rows")
def list_sub_classification_rows(
    upload_id: Optional[int] = None,
    amfi_code: Optional[str] = None,
    report_month: Optional[date] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(SubClassificationRow)
    if upload_id:
        q = q.filter_by(upload_id=upload_id)
    if amfi_code:
        q = q.filter_by(amfi_code=amfi_code)
    if report_month:
        q = q.filter_by(report_month=report_month)

    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [{"id": r.id, "amfi_code": r.amfi_code, "scheme_name": r.scheme_name, "scheme_category": r.scheme_category, "sub_classification": r.sub_classification} for r in items], "total": total}


# --- Quarterly Disclosure ---
@router.post("/quarterly/upload", response_model=MessageResponse)
async def upload_quarterly_disclosure(
    file: UploadFile = File(...),
    report_quarter: date = Form(...),
    db: Session = Depends(get_db),
):
    content = await file.read()
    file_path = save_upload(content, file.filename)
    result = process_quarterly_disclosure(db, file_path, report_quarter)
    return MessageResponse(message="Quarterly disclosure uploaded", detail=str(result))


@router.get("/quarterly/rows")
def list_quarterly_rows(
    upload_id: Optional[int] = None,
    amfi_code: Optional[str] = None,
    report_quarter: Optional[date] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(QuarterlyDisclosureRow)
    if upload_id:
        q = q.filter_by(upload_id=upload_id)
    if amfi_code:
        q = q.filter_by(amfi_code=amfi_code)
    if report_quarter:
        q = q.filter_by(report_quarter=report_quarter)

    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [{"id": r.id, "amfi_code": r.amfi_code, "scheme_name": r.scheme_name, "beta": str(r.beta), "sharpe_ratio": str(r.sharpe_ratio), "std_deviation": str(r.std_deviation)} for r in items], "total": total}
