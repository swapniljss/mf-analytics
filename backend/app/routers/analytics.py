from fastapi import APIRouter, BackgroundTasks, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional, List
from datetime import date, timedelta
from app.database import get_db
from app.models.analytics import SchemeAnalyticsSnapshot
from app.models.nav import NavPrice
from app.schemas.analytics import SchemeSnapshotOut, SchemeSnapshotListItem, SchemeReturnsOut, NAVDataPoint, TopPerformerOut
from app.schemas.common import PaginatedResponse
from app.services.analytics_service import (
    compute_scheme_returns,
    refresh_all_snapshots,
    compute_cagr,
    compute_absolute_return,
)

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/snapshots", response_model=PaginatedResponse[SchemeSnapshotListItem])
def list_snapshots(
    search: Optional[str] = None,
    amc_name: Optional[str] = None,
    category: Optional[str] = None,
    has_returns: bool = Query(False, description="Only show schemes with at least 1Y return data"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(SchemeAnalyticsSnapshot).filter(
        SchemeAnalyticsSnapshot.latest_nav.isnot(None)   # always hide empty shells
    )
    if search:
        q = q.filter(SchemeAnalyticsSnapshot.scheme_name.ilike(f"%{search}%"))
    if amc_name:
        q = q.filter(SchemeAnalyticsSnapshot.amc_name.ilike(f"%{amc_name}%"))
    if category:
        q = q.filter(SchemeAnalyticsSnapshot.scheme_category.ilike(f"%{category}%"))
    if has_returns:
        q = q.filter(SchemeAnalyticsSnapshot.return_1y.isnot(None))

    total = q.count()
    # Simple sort: category_rank (nulls last via ISNULL trick), then scheme_name
    # Avoids expression-based filesort that exhausts MySQL tmp space
    items = (
        q.order_by(
            SchemeAnalyticsSnapshot.scheme_category,
            SchemeAnalyticsSnapshot.scheme_name,
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return PaginatedResponse(
        items=items, total=total, page=page,
        page_size=page_size, total_pages=(total + page_size - 1) // page_size
    )


@router.get("/scheme/{amfi_code}/snapshot", response_model=Optional[SchemeSnapshotOut])
def get_scheme_snapshot(amfi_code: str, db: Session = Depends(get_db)):
    snap = db.query(SchemeAnalyticsSnapshot).filter_by(amfi_code=amfi_code).first()
    # Return null (not 404) — frontend handles missing data gracefully
    return snap


@router.get("/scheme/{amfi_code}/returns", response_model=SchemeReturnsOut)
def get_scheme_returns(
    amfi_code: str,
    from_date: date = Query(default=None),
    to_date: date = Query(default=None),
    db: Session = Depends(get_db),
):
    if to_date is None:
        to_date = date.today()
    if from_date is None:
        from_date = to_date - timedelta(days=365)

    history = (
        db.query(NavPrice)
        .filter(NavPrice.amfi_code == amfi_code, NavPrice.nav_date >= from_date, NavPrice.nav_date <= to_date)
        .order_by(NavPrice.nav_date)
        .all()
    )

    returns = compute_scheme_returns(db, amfi_code) if history else {}

    # Get scheme name from history or scheme master
    scheme_name = history[0].scheme_name if history else amfi_code
    if not history:
        from app.models.scheme import SchemeMaster
        s = db.query(SchemeMaster.scheme_name).filter_by(amfi_code=amfi_code).first()
        if s:
            scheme_name = s.scheme_name

    return SchemeReturnsOut(
        amfi_code=amfi_code,
        scheme_name=scheme_name,
        nav_history=[NAVDataPoint(nav_date=r.nav_date, nav=r.nav) for r in history],
        **returns,
    )


@router.get("/top-performers", response_model=List[TopPerformerOut])
def top_performers(
    category: Optional[str] = None,
    period: str = Query("return_1y", regex="^return_(1w|1m|3m|6m|1y|3y|5y|10y)$"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    col = getattr(SchemeAnalyticsSnapshot, period, SchemeAnalyticsSnapshot.return_1y)
    q = db.query(SchemeAnalyticsSnapshot).filter(col.isnot(None))
    if category:
        q = q.filter(SchemeAnalyticsSnapshot.scheme_category.ilike(f"%{category}%"))
    items = q.order_by(desc(col)).limit(limit).all()
    return [
        TopPerformerOut(
            amfi_code=s.amfi_code,
            scheme_name=s.scheme_name,
            amc_name=s.amc_name,
            scheme_category=s.scheme_category,
            return_value=getattr(s, period),
            latest_nav=s.latest_nav,
            aum_cr=s.aum_cr,
        )
        for s in items
    ]


@router.post("/refresh-snapshots")
def trigger_snapshot_refresh(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Kick off snapshot refresh in the background so the endpoint returns immediately."""
    from app.database import SessionLocal

    def _run():
        bg_db = SessionLocal()
        try:
            refresh_all_snapshots(bg_db)
        finally:
            bg_db.close()

    background_tasks.add_task(_run)
    return {"status": "refresh started", "message": "Snapshot refresh running in background"}


@router.get("/summary")
def get_dashboard_summary(db: Session = Depends(get_db)):
    from sqlalchemy import func
    from app.models.scheme import SchemeMaster, AmcMaster
    from app.models.aum import AverageAumFund

    total_schemes = db.query(func.count(SchemeMaster.id)).filter_by(is_active="Y").scalar()
    total_amcs = db.query(func.count(AmcMaster.id)).filter_by(is_active="Y").scalar()
    latest_nav_date = db.query(func.max(NavPrice.nav_date)).scalar()
    schemes_with_nav = db.query(func.count(SchemeAnalyticsSnapshot.id)).filter(
        SchemeAnalyticsSnapshot.latest_nav.isnot(None)
    ).scalar()
    schemes_with_returns = db.query(func.count(SchemeAnalyticsSnapshot.id)).filter(
        SchemeAnalyticsSnapshot.return_1y.isnot(None)
    ).scalar()
    # Most recent per-scheme refresh — drives the "Last refreshed X ago" UI signal.
    latest_snapshot_refresh = db.query(
        func.max(SchemeAnalyticsSnapshot.snapshot_refreshed_at)
    ).scalar()

    # Industry AUM: prefer monthly-disclosure sum; fall back to fund-wise AUM table
    total_aum = db.query(func.sum(SchemeAnalyticsSnapshot.aum_cr)).scalar()
    if not total_aum:
        # Use latest period from AverageAumFund
        latest_period = (
            db.query(AverageAumFund.fy_id, AverageAumFund.period_id)
            .order_by(AverageAumFund.fy_id.desc(), AverageAumFund.period_id.desc())
            .first()
        )
        if latest_period:
            total_aum = db.query(func.sum(AverageAumFund.total_aum_cr)).filter_by(
                fy_id=latest_period[0], period_id=latest_period[1]
            ).scalar()

    return {
        "total_active_schemes": total_schemes,
        "total_amcs": total_amcs,
        "latest_nav_date": str(latest_nav_date) if latest_nav_date else None,
        "total_industry_aum_cr": float(total_aum) if total_aum else None,
        "schemes_with_nav": schemes_with_nav,
        "schemes_with_returns": schemes_with_returns,
        # MySQL stores snapshot_refreshed_at as a naive UTC datetime (written
        # via datetime.utcnow()). isoformat() alone produces "...T09:35:15"
        # with no timezone marker, which JS parses as LOCAL time, causing a
        # 5h30 ("5 hr ago") drift in IST. The trailing "Z" marks it explicitly
        # as UTC so frontend formatRelativeTime() gets the right delta.
        "latest_snapshot_refreshed_at": (latest_snapshot_refresh.isoformat() + "Z") if latest_snapshot_refresh else None,
        "data_status": {
            "has_nav": (schemes_with_nav or 0) > 0,
            "has_returns": (schemes_with_returns or 0) > 0,
            "needs_history_sync": (schemes_with_returns or 0) < 1000,
        },
    }


@router.get("/scheme/{amfi_code}/rolling-returns")
def rolling_returns(
    amfi_code: str,
    period_years: float = Query(1.0, ge=0.5, le=10),
    db: Session = Depends(get_db),
):
    """
    Compute all possible rolling-period returns for a scheme.
    Returns stats: min, max, mean, median, positive_pct, and the full series.
    """
    period_days = int(period_years * 365)
    navs = (
        db.query(NavPrice.nav_date, NavPrice.nav)
        .filter(NavPrice.amfi_code == amfi_code)
        .order_by(NavPrice.nav_date)
        .all()
    )
    if len(navs) < period_days // 7:
        return {"period_years": period_years, "data_points": 0, "series": []}

    nav_list = [(r[0], float(r[1])) for r in navs]
    # Build a dict for fast lookup
    nav_dict = {d: v for d, v in nav_list}
    dates = [d for d, _ in nav_list]

    series = []
    for i, end_date in enumerate(dates):
        target_start = end_date - timedelta(days=period_days)
        # Find closest date on or just before target_start
        start_nav = None
        for j in range(i - 1, -1, -1):
            if dates[j] <= target_start:
                start_nav = nav_dict[dates[j]]
                break
        if start_nav and start_nav > 0:
            end_nav = nav_dict[end_date]
            if period_years > 1:
                ret = compute_cagr(start_nav, end_nav, period_years)
            else:
                ret = compute_absolute_return(start_nav, end_nav)
            if ret is not None:
                series.append({"date": str(end_date), "return": round(ret, 4)})

    if not series:
        return {"period_years": period_years, "data_points": 0, "series": []}

    vals = [s["return"] for s in series]
    vals_sorted = sorted(vals)
    n = len(vals_sorted)
    return {
        "period_years": period_years,
        "data_points": n,
        "min": round(vals_sorted[0], 4),
        "max": round(vals_sorted[-1], 4),
        "mean": round(sum(vals) / n, 4),
        "median": round(vals_sorted[n // 2], 4),
        "positive_pct": round(sum(1 for v in vals if v > 0) / n * 100, 2),
        "gt_8_pct": round(sum(1 for v in vals if v > 8) / n * 100, 2),
        "gt_12_pct": round(sum(1 for v in vals if v > 12) / n * 100, 2),
        "series": series[-500:],  # last 500 for chart — trim to avoid huge payloads
    }


@router.get("/scheme/{amfi_code}/calendar-returns")
def calendar_year_returns(
    amfi_code: str,
    db: Session = Depends(get_db),
):
    """Return per-calendar-year absolute return for a scheme."""
    navs = (
        db.query(NavPrice.nav_date, NavPrice.nav)
        .filter(NavPrice.amfi_code == amfi_code)
        .order_by(NavPrice.nav_date)
        .all()
    )
    if len(navs) < 2:
        return {"years": []}

    # Build year → (first_nav, last_nav)
    year_data: dict = {}
    for nav_date, nav_val in navs:
        y = nav_date.year
        v = float(nav_val)
        if y not in year_data:
            year_data[y] = {"first": v, "last": v}
        else:
            year_data[y]["last"] = v

    years = sorted(year_data.keys())
    results = []
    for i, y in enumerate(years):
        if i == 0:
            start_nav = year_data[y]["first"]
        else:
            start_nav = year_data[years[i - 1]]["last"]
        end_nav = year_data[y]["last"]
        if start_nav > 0:
            ret = round((end_nav - start_nav) / start_nav * 100, 4)
            results.append({"year": y, "return": ret})

    return {"amfi_code": amfi_code, "years": results}


@router.get("/category/comparison")
def category_comparison(
    category: str = Query(..., description="Scheme category, e.g. 'Large Cap Fund'"),
    period: str = Query("return_1y", regex="^return_(1w|1m|3m|6m|1y|3y|5y|10y)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """All schemes in a category ranked by the given period return, with category stats."""
    from sqlalchemy import func as sqlfunc
    col = getattr(SchemeAnalyticsSnapshot, period)
    q = (
        db.query(SchemeAnalyticsSnapshot)
        .filter(SchemeAnalyticsSnapshot.scheme_category.ilike(f"%{category}%"))
        .filter(col.isnot(None))
        .order_by(desc(col))
    )
    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()

    # Category stats
    stats = db.query(
        sqlfunc.avg(col),
        sqlfunc.max(col),
        sqlfunc.min(col),
    ).filter(
        SchemeAnalyticsSnapshot.scheme_category.ilike(f"%{category}%"),
        col.isnot(None),
    ).first()

    return {
        "category": category,
        "period": period,
        "total": total,
        "category_avg": round(float(stats[0]), 4) if stats[0] else None,
        "category_max": round(float(stats[1]), 4) if stats[1] else None,
        "category_min": round(float(stats[2]), 4) if stats[2] else None,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "rank": (page - 1) * page_size + i + 1,
                "amfi_code": s.amfi_code,
                "scheme_name": s.scheme_name,
                "amc_name": s.amc_name,
                "return_value": float(getattr(s, period)) if getattr(s, period) else None,
                "return_1y": float(s.return_1y) if s.return_1y else None,
                "return_3y": float(s.return_3y) if s.return_3y else None,
                "return_5y": float(s.return_5y) if s.return_5y else None,
                "aum_cr": float(s.aum_cr) if s.aum_cr else None,
                "expense_ratio": float(s.expense_ratio) if s.expense_ratio else None,
                "sharpe_ratio": float(s.sharpe_ratio) if s.sharpe_ratio else None,
                "max_drawdown": float(s.max_drawdown) if s.max_drawdown else None,
                "category_quartile": s.category_quartile,
            }
            for i, s in enumerate(items)
        ],
    }


@router.get("/compare/direct-regular")
def compare_direct_regular(
    amfi_code: str = Query(..., description="AMFI code of either the Direct or Regular plan"),
    db: Session = Depends(get_db),
):
    """Compare the Direct and Regular plans of the same scheme."""
    import re as _re
    from app.models.scheme import SchemeMaster

    scheme = db.query(SchemeMaster).filter_by(amfi_code=amfi_code).first()
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")

    my_plan = (scheme.plan_type or "").strip()
    other_plan = "Regular" if my_plan == "Direct" else "Direct"

    # Find partner: same AMC + category + option, different plan
    candidates = (
        db.query(SchemeMaster)
        .filter(
            SchemeMaster.amfi_code != amfi_code,
            SchemeMaster.amc_name == scheme.amc_name,
            SchemeMaster.scheme_category == scheme.scheme_category,
            SchemeMaster.option_type == scheme.option_type,
            SchemeMaster.plan_type == other_plan,
            SchemeMaster.is_active == "Y",
        )
        .all()
    )

    # Pick closest by name similarity
    def _name_key(s):
        return _re.sub(r"\b(direct|regular|plan)\b", "", s.scheme_name.lower()).strip()

    my_key = _name_key(scheme)
    partner = None
    for c in candidates:
        if _name_key(c) == my_key:
            partner = c
            break
    if not partner and candidates:
        partner = candidates[0]  # fallback: first candidate

    if not partner:
        return {"available": False, "reason": f"No {other_plan} plan found for this scheme"}

    # Fetch both snapshots
    snap_mine = db.query(SchemeAnalyticsSnapshot).filter_by(amfi_code=amfi_code).first()
    snap_other = db.query(SchemeAnalyticsSnapshot).filter_by(amfi_code=partner.amfi_code).first()

    def _snap_dict(s, scheme_obj):
        if not s:
            return None
        return {
            "amfi_code": scheme_obj.amfi_code,
            "scheme_name": scheme_obj.scheme_name,
            "plan_type": scheme_obj.plan_type,
            "expense_ratio": float(s.expense_ratio) if s.expense_ratio else None,
            "return_1y": float(s.return_1y) if s.return_1y else None,
            "return_3y": float(s.return_3y) if s.return_3y else None,
            "return_5y": float(s.return_5y) if s.return_5y else None,
            "return_10y": float(s.return_10y) if s.return_10y else None,
            "latest_nav": float(s.latest_nav) if s.latest_nav else None,
            "aum_cr": float(s.aum_cr) if s.aum_cr else None,
        }

    direct_d   = _snap_dict(snap_mine, scheme)   if my_plan == "Direct"  else _snap_dict(snap_other, partner)
    regular_d  = _snap_dict(snap_other, partner) if my_plan == "Direct"  else _snap_dict(snap_mine, scheme)

    er_direct  = direct_d["expense_ratio"]  if direct_d  else None
    er_regular = regular_d["expense_ratio"] if regular_d else None
    r1_direct  = direct_d["return_1y"]      if direct_d  else None
    r1_regular = regular_d["return_1y"]     if regular_d else None

    return {
        "available": True,
        "direct": direct_d,
        "regular": regular_d,
        "expense_gap": round(er_regular - er_direct, 4) if er_regular and er_direct else None,
        "return_gap_1y": round(r1_direct - r1_regular, 4) if r1_direct and r1_regular else None,
        "compounding_impact_10y_per_lakh": round(
            100000 * ((1 + (r1_direct or 0) / 100) ** 10 - (1 + (r1_regular or 0) / 100) ** 10), 2
        ) if r1_direct and r1_regular else None,
    }


@router.get("/goal/lumpsum")
def goal_lumpsum(
    amount: float = Query(..., gt=0, description="Initial investment in ₹"),
    rate: float = Query(..., gt=0, description="Expected annual return % e.g. 12"),
    years: float = Query(..., gt=0, description="Holding period in years"),
    inflation: float = Query(6.0, ge=0, description="Assumed inflation %"),
    tax_rate: float = Query(10.0, ge=0, le=100, description="LTCG/Tax rate %"),
):
    r = rate / 100
    fv = amount * (1 + r) ** years
    gain = fv - amount
    tax = gain * (tax_rate / 100)
    post_tax_fv = fv - tax

    real_r = ((1 + r) / (1 + inflation / 100)) - 1
    real_fv = amount * (1 + real_r) ** years

    return {
        "initial_investment": amount,
        "annual_return_pct": rate,
        "years": years,
        "future_value": round(fv, 2),
        "total_gain": round(gain, 2),
        "tax_on_gains": round(tax, 2),
        "post_tax_value": round(post_tax_fv, 2),
        "inflation_adjusted_value": round(real_fv, 2),
        "wealth_ratio": round(fv / amount, 2),
    }


@router.get("/goal/sip")
def goal_sip(
    monthly_amount: float = Query(..., gt=0, description="Monthly SIP amount in ₹"),
    rate: float = Query(..., gt=0, description="Expected annual return %"),
    years: float = Query(..., gt=0, description="SIP tenure in years"),
    step_up: float = Query(0.0, ge=0, description="Annual SIP step-up %"),
):
    n_months = int(years * 12)
    monthly_rate = rate / 100 / 12

    if step_up == 0:
        if monthly_rate > 0:
            fv = monthly_amount * (((1 + monthly_rate) ** n_months - 1) / monthly_rate) * (1 + monthly_rate)
        else:
            fv = monthly_amount * n_months
        total_invested = monthly_amount * n_months
    else:
        fv = 0.0
        total_invested = 0.0
        current_sip = monthly_amount
        for year in range(int(years) + 1):
            months_in_year = min(12, n_months - year * 12)
            if months_in_year <= 0:
                break
            for m in range(months_in_year):
                periods_left = n_months - (year * 12 + m)
                fv += current_sip * (1 + monthly_rate) ** periods_left
                total_invested += current_sip
            current_sip *= (1 + step_up / 100)

    return {
        "monthly_amount": monthly_amount,
        "annual_return_pct": rate,
        "years": years,
        "step_up_pct": step_up,
        "total_invested": round(total_invested, 2),
        "future_value": round(fv, 2),
        "total_gain": round(fv - total_invested, 2),
        "wealth_ratio": round(fv / total_invested, 2) if total_invested > 0 else None,
    }


@router.get("/goal/retirement")
def goal_retirement(
    current_age: int = Query(..., ge=18, le=80),
    retirement_age: int = Query(60, ge=30, le=85),
    monthly_expense: float = Query(..., gt=0, description="Current monthly expense in ₹"),
    corpus_years: int = Query(25, ge=5, le=50, description="Years corpus should last post-retirement"),
    expected_return: float = Query(12.0, description="Pre-retirement return %"),
    post_return: float = Query(8.0, description="Post-retirement return %"),
    inflation: float = Query(6.0, description="Inflation %"),
):
    years_to_retire = retirement_age - current_age
    if years_to_retire <= 0:
        raise HTTPException(status_code=422, detail="retirement_age must be greater than current_age")

    # Inflation-adjusted monthly expense at retirement
    future_monthly = monthly_expense * (1 + inflation / 100) ** years_to_retire
    future_annual = future_monthly * 12

    # Corpus needed at retirement (annuity formula)
    post_r = post_return / 100
    infl = inflation / 100
    real_post_r = ((1 + post_r) / (1 + infl)) - 1
    if abs(real_post_r) < 1e-6:
        corpus_needed = future_annual * corpus_years
    else:
        corpus_needed = future_annual * (1 - (1 + real_post_r) ** (-corpus_years)) / real_post_r

    # Monthly SIP to reach corpus
    r_monthly = expected_return / 100 / 12
    n = years_to_retire * 12
    if r_monthly > 0:
        sip_needed = corpus_needed * r_monthly / ((1 + r_monthly) ** n - 1) / (1 + r_monthly)
    else:
        sip_needed = corpus_needed / n

    return {
        "current_age": current_age,
        "retirement_age": retirement_age,
        "years_to_retire": years_to_retire,
        "current_monthly_expense": monthly_expense,
        "future_monthly_expense_at_retirement": round(future_monthly, 2),
        "corpus_needed": round(corpus_needed, 2),
        "monthly_sip_needed": round(sip_needed, 2),
        "corpus_lasts_years": corpus_years,
    }
