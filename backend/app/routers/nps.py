"""
NPS / APY router — all endpoints under /nps prefix.

Endpoints:
  POST /nps/upload                    Upload a single ZIP file
  POST /nps/upload/bulk               Upload multiple ZIP files at once
  GET  /nps/pfms                      List all Pension Fund Managers
  GET  /nps/schemes                   List schemes (filterable)
  GET  /nps/schemes/{scheme_code}     Scheme detail
  GET  /nps/nav/{scheme_code}/history NAV history
  GET  /nps/analytics/{scheme_code}   Analytics snapshot for one scheme
  GET  /nps/analytics/snapshots       All snapshots (filterable + paginated)
  POST /nps/analytics/refresh         Refresh all analytics snapshots
  POST /nps/analytics/refresh/{scheme_code}  Refresh single scheme
"""

import logging
from datetime import date, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, BackgroundTasks
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.nps import NPSAnalyticsSnapshot
from app.services.nps_service import (
    ingest_nps_zip, list_pfms, list_schemes, get_scheme, get_nps_nav_history,
)
from app.services.nps_analytics_service import (
    refresh_nps_snapshot, refresh_all_nps_snapshots,
)
from app.schemas.nps import (
    PfmOut, SchemeOut, NavPointOut, UploadResult, SnapshotOut, RefreshResult,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/nps", tags=["NPS / APY"])


# ── upload ────────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=UploadResult)
async def upload_nps_zip(
    file: UploadFile = File(..., description="NAV_File_DDMMYYYY.zip from NPS Trust"),
    db: Session = Depends(get_db),
):
    """Upload a single daily NAV ZIP file."""
    zip_bytes = await file.read()
    try:
        result = ingest_nps_zip(db, zip_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.post("/upload/bulk", response_model=List[UploadResult])
async def upload_nps_bulk(
    files: List[UploadFile] = File(..., description="Multiple ZIP files"),
    db: Session = Depends(get_db),
):
    """Upload multiple daily NAV ZIP files in one request."""
    results = []
    for f in files:
        zip_bytes = await f.read()
        try:
            result = ingest_nps_zip(db, zip_bytes)
        except ValueError as e:
            result = {"filename": f.filename, "records": 0, "inserted": 0, "error": str(e)}
        results.append(result)
    return results


# ── master data ───────────────────────────────────────────────────────────────

@router.get("/pfms", response_model=List[PfmOut])
def get_pfms(db: Session = Depends(get_db)):
    """List all Pension Fund Managers."""
    return list_pfms(db)


@router.get("/schemes", response_model=List[SchemeOut])
def get_schemes(
    pfm_code:    Optional[str] = Query(None, description="Filter by PFM code e.g. PFM001"),
    asset_class: Optional[str] = Query(None, description="E / C / G / A"),
    tier:        Optional[str] = Query(None, description="I / II"),
    category:    Optional[str] = Query(None, description="NPS / APY / CENTRAL_GOVT / STATE_GOVT / …"),
    is_apy:      Optional[bool] = Query(None, description="true = APY schemes only"),
    db: Session = Depends(get_db),
):
    """List NPS/APY schemes with optional filters."""
    return list_schemes(db, pfm_code=pfm_code, asset_class=asset_class,
                        tier=tier, category=category, is_apy=is_apy)


@router.get("/schemes/{scheme_code}", response_model=SchemeOut)
def get_scheme_detail(scheme_code: str, db: Session = Depends(get_db)):
    scheme = get_scheme(db, scheme_code)
    if not scheme:
        raise HTTPException(status_code=404, detail=f"Scheme {scheme_code} not found")
    return scheme


# ── NAV history ───────────────────────────────────────────────────────────────

@router.get("/nav/{scheme_code}/history", response_model=List[NavPointOut])
def nps_nav_history(
    scheme_code: str,
    from_date: Optional[date] = Query(None),
    to_date:   Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    """
    NAV history for a scheme. Defaults to last 1 year if no dates provided.
    """
    if not get_scheme(db, scheme_code):
        raise HTTPException(status_code=404, detail=f"Scheme {scheme_code} not found")
    if to_date is None:
        to_date = date.today()
    if from_date is None:
        from_date = to_date - timedelta(days=365)
    return get_nps_nav_history(db, scheme_code, from_date, to_date)


# ── analytics ─────────────────────────────────────────────────────────────────

@router.get("/analytics/snapshots", response_model=List[SnapshotOut])
def nps_all_snapshots(
    pfm_code:    Optional[str]  = Query(None),
    asset_class: Optional[str]  = Query(None, description="E / C / G / A / NA"),
    tier:        Optional[str]  = Query(None, description="I / II / NA"),
    category:    Optional[str]  = Query(None),
    is_apy:      Optional[bool] = Query(None),
    page:        int = Query(1, ge=1),
    page_size:   int = Query(1000, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    """All NPS analytics snapshots with optional filters."""
    q = db.query(NPSAnalyticsSnapshot)
    if pfm_code:
        q = q.filter(NPSAnalyticsSnapshot.pfm_code == pfm_code)
    if asset_class:
        q = q.filter(NPSAnalyticsSnapshot.asset_class == asset_class.upper())
    if tier:
        q = q.filter(NPSAnalyticsSnapshot.tier == tier.upper())
    if category:
        q = q.filter(NPSAnalyticsSnapshot.category == category.upper())
    if is_apy is not None:
        q = q.filter(NPSAnalyticsSnapshot.is_apy == (1 if is_apy else 0))
    q = q.order_by(NPSAnalyticsSnapshot.pfm_code, NPSAnalyticsSnapshot.scheme_code)
    return q.offset((page - 1) * page_size).limit(page_size).all()


@router.get("/analytics/{scheme_code}", response_model=SnapshotOut)
def nps_scheme_analytics(scheme_code: str, db: Session = Depends(get_db)):
    """Analytics snapshot for a single scheme."""
    snap = db.query(NPSAnalyticsSnapshot).filter_by(scheme_code=scheme_code).first()
    if not snap:
        raise HTTPException(status_code=404, detail=f"No snapshot for {scheme_code}. Run /nps/analytics/refresh first.")
    return snap


@router.post("/analytics/refresh", response_model=RefreshResult)
def nps_refresh_all(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Refresh analytics snapshots for all NPS/APY schemes.
    Runs synchronously — takes ~30-60 seconds for 252 schemes.
    """
    result = refresh_all_nps_snapshots(db)
    return result


@router.post("/analytics/refresh/{scheme_code}")
def nps_refresh_one(scheme_code: str, db: Session = Depends(get_db)):
    """Refresh analytics snapshot for a single scheme."""
    scheme = get_scheme(db, scheme_code)
    if not scheme:
        raise HTTPException(status_code=404, detail=f"Scheme {scheme_code} not found")
    refresh_nps_snapshot(db, scheme_code)
    snap = db.query(NPSAnalyticsSnapshot).filter_by(scheme_code=scheme_code).first()
    return snap
