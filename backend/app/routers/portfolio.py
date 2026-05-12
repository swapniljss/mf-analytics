from fastapi import APIRouter, Depends, Query, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import Optional
from app.database import get_db
from app.models.portfolio import PortfolioUpload, PortfolioHolding
from app.schemas.common import MessageResponse
from app.services.portfolio_service import process_portfolio_file
from app.utils.file_utils import save_upload

router = APIRouter(prefix="/portfolio", tags=["Portfolio"])


@router.post("/upload", response_model=MessageResponse)
async def upload_portfolio(
    file: UploadFile = File(...),
    report_month: str = Form(..., description="YYYY-MM e.g. 2025-06"),
    db: Session = Depends(get_db),
):
    """Upload portfolio holdings CSV or Excel. report_month = YYYY-MM."""
    import re
    if not re.match(r"^\d{4}-\d{2}$", report_month):
        raise HTTPException(status_code=422, detail="report_month must be YYYY-MM")
    content = await file.read()
    file_path = save_upload(content, file.filename)
    try:
        result = process_portfolio_file(db, file_path, report_month)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return MessageResponse(
        message=f"Loaded {result['inserted']} holdings for {report_month} across {result['unique_schemes']} schemes",
        detail=str(result),
    )


@router.get("/uploads")
def list_uploads(db: Session = Depends(get_db)):
    items = db.query(PortfolioUpload).order_by(desc(PortfolioUpload.report_month)).limit(100).all()
    return {"items": [
        {"id": i.id, "report_month": i.report_month, "source_filename": i.source_filename,
         "status": i.status, "total_rows": i.total_rows, "created_at": str(i.created_at)}
        for i in items
    ]}


@router.get("/months")
def list_months(db: Session = Depends(get_db)):
    rows = (db.query(PortfolioHolding.report_month)
            .distinct()
            .order_by(desc(PortfolioHolding.report_month))
            .all())
    return {"months": [r[0] for r in rows]}


@router.get("/holdings")
def list_holdings(
    amfi_code: Optional[str] = None,
    report_month: Optional[str] = None,
    sector: Optional[str] = None,
    search: Optional[str] = None,
    security_class: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List portfolio holdings. If no report_month, uses latest available month."""
    if not report_month:
        latest = (db.query(func.max(PortfolioHolding.report_month)).scalar())
        report_month = latest

    if not report_month:
        return {"items": [], "total": 0, "report_month": None}

    q = db.query(PortfolioHolding).filter_by(report_month=report_month)
    if amfi_code:
        q = q.filter(PortfolioHolding.amfi_code == amfi_code)
    if sector:
        q = q.filter(PortfolioHolding.sector == sector)
    if security_class:
        q = q.filter(PortfolioHolding.security_class == security_class)
    if search:
        q = q.filter(PortfolioHolding.company_name.ilike(f"%{search}%"))

    total = q.count()
    items = (q.order_by(desc(PortfolioHolding.percentage_exposure))
              .offset((page - 1) * page_size)
              .limit(page_size)
              .all())

    return {
        "report_month": report_month,
        "total": total,
        "items": [_row(r) for r in items],
    }


@router.get("/top-holdings/{amfi_code}")
def top_holdings(
    amfi_code: str,
    report_month: Optional[str] = None,
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Top holdings for a scheme, ordered by percentage exposure."""
    if not report_month:
        latest = (db.query(func.max(PortfolioHolding.report_month))
                    .filter(PortfolioHolding.amfi_code == amfi_code)
                    .scalar())
        report_month = latest

    if not report_month:
        return {"items": [], "report_month": None}

    items = (db.query(PortfolioHolding)
               .filter_by(amfi_code=amfi_code, report_month=report_month)
               .order_by(desc(PortfolioHolding.percentage_exposure))
               .limit(limit)
               .all())

    # Sector breakdown
    all_holdings = (db.query(PortfolioHolding)
                      .filter_by(amfi_code=amfi_code, report_month=report_month)
                      .all())
    sector_map: dict = {}
    for h in all_holdings:
        if h.sector:
            sector_map[h.sector] = sector_map.get(h.sector, 0.0) + (float(h.percentage_exposure) if h.percentage_exposure else 0.0)
    top_sectors = sorted(sector_map.items(), key=lambda x: -x[1])[:10]

    # Maturity / duration (for debt)
    avg_mat = next((float(h.avg_maturity_years) for h in all_holdings if h.avg_maturity_years), None)
    mod_dur = next((float(h.modified_duration) for h in all_holdings if h.modified_duration), None)

    return {
        "report_month": report_month,
        "top_holdings": [_row(r) for r in items],
        "top_sectors": [{"sector": s, "percentage": round(p, 2)} for s, p in top_sectors],
        "avg_maturity_years": avg_mat,
        "modified_duration": mod_dur,
    }


@router.get("/sectors")
def list_sectors(
    report_month: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Distinct sectors for a given month."""
    if not report_month:
        report_month = db.query(func.max(PortfolioHolding.report_month)).scalar()
    rows = (db.query(PortfolioHolding.sector)
              .filter(PortfolioHolding.report_month == report_month,
                      PortfolioHolding.sector.isnot(None))
              .distinct()
              .order_by(PortfolioHolding.sector)
              .all())
    return {"sectors": [r[0] for r in rows]}


@router.get("/overlap")
def portfolio_overlap(
    amfi_code_1: str = Query(...),
    amfi_code_2: str = Query(...),
    report_month: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Compute portfolio overlap between two schemes (by ISIN weight)."""
    if not report_month:
        report_month = db.query(func.max(PortfolioHolding.report_month)).scalar()
    if not report_month:
        return {"overlap_percentage": 0, "common_stocks": 0, "common_holdings": []}

    def get_holdings(code):
        return {
            h.company_isin: h
            for h in db.query(PortfolioHolding)
               .filter_by(amfi_code=code, report_month=report_month)
               .all()
            if h.company_isin
        }

    h1 = get_holdings(amfi_code_1)
    h2 = get_holdings(amfi_code_2)
    common = set(h1.keys()) & set(h2.keys())

    overlap_pct = sum(
        min(float(h1[i].percentage_exposure or 0), float(h2[i].percentage_exposure or 0))
        for i in common
    )

    return {
        "report_month": report_month,
        "scheme_1": amfi_code_1,
        "scheme_2": amfi_code_2,
        "common_stocks": len(common),
        "overlap_percentage": round(overlap_pct, 2),
        "common_holdings": sorted([
            {
                "company_isin": i,
                "company_name": h1[i].company_name,
                "scheme_1_weight": round(float(h1[i].percentage_exposure or 0), 4),
                "scheme_2_weight": round(float(h2[i].percentage_exposure or 0), 4),
            }
            for i in common
        ], key=lambda x: -(x["scheme_1_weight"] + x["scheme_2_weight"])),
    }


@router.get("/concentration/{amfi_code}")
def portfolio_concentration(
    amfi_code: str,
    report_month: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Herfindahl-Hirschman concentration index + top-5/10 weight."""
    if not report_month:
        report_month = (
            db.query(func.max(PortfolioHolding.report_month))
            .filter(PortfolioHolding.amfi_code == amfi_code)
            .scalar()
        )
    if not report_month:
        return {"report_month": None}

    holdings = (
        db.query(PortfolioHolding)
        .filter_by(amfi_code=amfi_code, report_month=report_month)
        .order_by(desc(PortfolioHolding.percentage_exposure))
        .all()
    )
    if not holdings:
        return {"report_month": report_month, "total_holdings": 0}

    weights = [float(h.percentage_exposure or 0) for h in holdings]
    hhi = sum(w ** 2 for w in weights)  # × 10000 gives standard HHI

    return {
        "report_month": report_month,
        "total_holdings": len(holdings),
        "top5_weight": round(sum(weights[:5]), 2),
        "top10_weight": round(sum(weights[:10]), 2),
        "hhi": round(hhi, 4),           # < 100 diversified, > 2500 concentrated
        "hhi_normalized": round(hhi / 10000, 6),
        "top10": [
            {
                "rank": i + 1,
                "company_name": h.company_name,
                "company_isin": h.company_isin,
                "sector": h.sector,
                "percentage_exposure": round(float(h.percentage_exposure or 0), 4),
                "market_value_cr": round(float(h.market_value_cr or 0), 4),
            }
            for i, h in enumerate(holdings[:10])
        ],
    }


def _row(r: PortfolioHolding) -> dict:
    return {
        "id": r.id,
        "amfi_code": r.amfi_code,
        "scheme_name": r.scheme_name,
        "company_name": r.company_name,
        "company_isin": r.company_isin,
        "sector": r.sector,
        "quantity": float(r.quantity) if r.quantity else None,
        "market_value_cr": float(r.market_value_cr) if r.market_value_cr else None,
        "percentage_exposure": float(r.percentage_exposure) if r.percentage_exposure else None,
        "security_class": r.security_class,
        "rating": r.rating,
        "rating_agency": r.rating_agency,
        "avg_maturity_years": float(r.avg_maturity_years) if r.avg_maturity_years else None,
        "modified_duration": float(r.modified_duration) if r.modified_duration else None,
        "report_month": r.report_month,
    }
