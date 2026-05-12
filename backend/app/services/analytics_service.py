import logging
from datetime import date, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.models.nav import NavPrice
from app.models.analytics import SchemeAnalyticsSnapshot
from app.models.scheme import SchemeMaster
from app.models.disclosure import MonthlyDisclosureRow, QuarterlyDisclosureRow
from app.models.tracking import TrackingError, TrackingDifference

logger = logging.getLogger(__name__)


def compute_cagr(nav_start: float, nav_end: float, years: float) -> Optional[float]:
    if nav_start <= 0 or years <= 0:
        return None
    return ((nav_end / nav_start) ** (1 / years) - 1) * 100


def compute_absolute_return(nav_start: float, nav_end: float) -> Optional[float]:
    if nav_start <= 0:
        return None
    return ((nav_end - nav_start) / nav_start) * 100


def get_nav_on_or_before(db: Session, amfi_code: str, target_date: date) -> Optional[NavPrice]:
    return (
        db.query(NavPrice)
        .filter(NavPrice.amfi_code == amfi_code, NavPrice.nav_date <= target_date)
        .order_by(desc(NavPrice.nav_date))
        .first()
    )


def compute_scheme_returns(db: Session, amfi_code: str) -> dict:
    latest = get_nav_on_or_before(db, amfi_code, date.today())
    if not latest:
        return {}

    today = latest.nav_date
    nav_end = float(latest.nav)

    def get_return(days: int, years: float) -> Optional[float]:
        past_date = today - timedelta(days=days)
        past = get_nav_on_or_before(db, amfi_code, past_date)
        if not past:
            return None
        # Reject if the actual NAV record is more than `days` calendar days
        # before the target past_date — that means we're using a data point
        # far outside the intended lookback window (e.g. a 2-year-old NAV
        # to compute a "1-week" return), which produces meaningless results.
        gap = (past_date - past.nav_date).days
        if gap > days:
            return None
        nav_s = float(past.nav)
        if years <= 1:
            return compute_absolute_return(nav_s, nav_end)
        return compute_cagr(nav_s, nav_end, years)

    return {
        "return_1w": get_return(7, 7 / 365),
        "return_1m": get_return(30, 30 / 365),
        "return_3m": get_return(91, 91 / 365),
        "return_6m": get_return(182, 182 / 365),
        "return_1y": get_return(365, 1),
        "return_3y": get_return(1095, 3),
        "return_5y": get_return(1825, 5),
        "return_10y": get_return(3650, 10),
    }


def compute_52w_high_low(db: Session, amfi_code: str, as_of: date):
    """Return (high, low) NAV over last 365 days."""
    from sqlalchemy import func as sqlfunc
    start = as_of - timedelta(days=365)
    result = (
        db.query(
            sqlfunc.max(NavPrice.nav),
            sqlfunc.min(NavPrice.nav),
        )
        .filter(
            NavPrice.amfi_code == amfi_code,
            NavPrice.nav_date >= start,
            NavPrice.nav_date <= as_of,
        )
        .first()
    )
    if result and result[0]:
        return float(result[0]), float(result[1])
    return None, None


def compute_sip_return(db: Session, amfi_code: str, years: int) -> Optional[float]:
    """
    Compute SIP XIRR for monthly ₹1000 SIP over `years` years.
    Uses Newton-Raphson; no scipy required.
    """
    from dateutil.relativedelta import relativedelta

    today = date.today()
    start = today - relativedelta(years=years)

    # Collect monthly investment dates
    inv_dates = []
    d = start
    while d <= today:
        inv_dates.append(d)
        d += relativedelta(months=1)

    if len(inv_dates) < 6:
        return None

    # Get NAV on or just before each date
    nav_map = {}
    for inv_d in inv_dates:
        row = get_nav_on_or_before(db, amfi_code, inv_d)
        if row:
            nav_map[inv_d] = float(row.nav)

    if len(nav_map) < max(6, len(inv_dates) // 2):
        return None

    valid_dates = sorted(nav_map.keys())
    latest_nav_val = nav_map[valid_dates[-1]]

    # Cash flows: -1000 on each inv date, +redemption on final date
    if any(nav_map[d] <= 0 for d in valid_dates):
        return None
    total_units = sum(1000.0 / nav_map[d] for d in valid_dates)
    final_value = total_units * latest_nav_val

    cf_dates = valid_dates + [today]
    cf_amounts = [-1000.0] * len(valid_dates) + [final_value]
    day0 = cf_dates[0]

    def f(r: float) -> float:
        return sum(
            amt / (1 + r) ** ((d - day0).days / 365.0)
            for amt, d in zip(cf_amounts, cf_dates)
        )

    def df(r: float) -> float:
        return sum(
            -((d - day0).days / 365.0) * amt / (1 + r) ** ((d - day0).days / 365.0 + 1)
            for amt, d in zip(cf_amounts, cf_dates)
        )

    r = 0.12  # initial guess 12%
    try:
        for _ in range(200):
            fr = f(r)
            dfr = df(r)
            if abs(dfr) < 1e-12:
                break
            r1 = r - fr / dfr
            if abs(r1 - r) < 1e-8:
                r = r1
                break
            r = max(-0.99, min(r1, 50.0))
        if -1 < r < 50:
            return round(r * 100, 4)
    except Exception:
        pass
    return None


def compute_max_drawdown(db: Session, amfi_code: str, years: int = 3) -> Optional[float]:
    """Largest peak-to-trough decline over the last `years` years (positive number = loss %)."""
    from_date = date.today() - timedelta(days=years * 365)
    navs = (
        db.query(NavPrice.nav_date, NavPrice.nav)
        .filter(NavPrice.amfi_code == amfi_code, NavPrice.nav_date >= from_date)
        .order_by(NavPrice.nav_date)
        .all()
    )
    if len(navs) < 10:
        return None
    peak = float(navs[0][1])
    max_dd = 0.0
    for _, nav_val in navs:
        nav_f = float(nav_val)
        if nav_f > peak:
            peak = nav_f
        dd = (peak - nav_f) / peak * 100 if peak > 0 else 0.0
        if dd > max_dd:
            max_dd = dd
    return round(max_dd, 4) if max_dd > 0 else None


def compute_sortino_ratio(db: Session, amfi_code: str, years: int = 3, risk_free_rate: float = 0.065) -> Optional[float]:
    """Sortino Ratio = (Ann. Return − Risk Free) / Downside Deviation."""
    from_date = date.today() - timedelta(days=years * 365)
    navs = (
        db.query(NavPrice.nav_date, NavPrice.nav)
        .filter(NavPrice.amfi_code == amfi_code, NavPrice.nav_date >= from_date)
        .order_by(NavPrice.nav_date)
        .all()
    )
    if len(navs) < 60:
        return None
    daily_returns = []
    for i in range(1, len(navs)):
        prev = float(navs[i - 1][1])
        curr = float(navs[i][1])
        if prev > 0:
            daily_returns.append((curr - prev) / prev)
    if len(daily_returns) < 30:
        return None
    avg = sum(daily_returns) / len(daily_returns)
    ann_return = (1 + avg) ** 252 - 1
    daily_rfr = (1 + risk_free_rate) ** (1 / 252) - 1
    downside = [min(0.0, r - daily_rfr) for r in daily_returns]
    import math
    downside_dev = math.sqrt(sum(r ** 2 for r in downside) / len(downside)) * math.sqrt(252)
    if downside_dev < 1e-10:
        return None
    return round((ann_return - risk_free_rate) / downside_dev, 4)


def compute_var_95(db: Session, amfi_code: str, years: int = 1) -> Optional[float]:
    """Historical 1-day VaR at 95% confidence (positive = potential daily loss %)."""
    from_date = date.today() - timedelta(days=years * 365)
    navs = (
        db.query(NavPrice.nav_date, NavPrice.nav)
        .filter(NavPrice.amfi_code == amfi_code, NavPrice.nav_date >= from_date)
        .order_by(NavPrice.nav_date)
        .all()
    )
    if len(navs) < 30:
        return None
    daily_returns = []
    for i in range(1, len(navs)):
        prev = float(navs[i - 1][1])
        curr = float(navs[i][1])
        if prev > 0:
            daily_returns.append((curr - prev) / prev * 100)
    if len(daily_returns) < 20:
        return None
    daily_returns.sort()
    idx = max(0, int(len(daily_returns) * 0.05) - 1)
    return round(-daily_returns[idx], 4)  # positive = loss


def compute_calmar_ratio(ann_return: Optional[float], max_drawdown: Optional[float]) -> Optional[float]:
    """Calmar = Annualised Return / Max Drawdown."""
    if not ann_return or not max_drawdown or max_drawdown <= 0:
        return None
    return round(ann_return / max_drawdown, 4)


def refresh_snapshot(db: Session, amfi_code: str) -> None:
    scheme = db.query(SchemeMaster).filter_by(amfi_code=amfi_code, is_active="Y").first()
    if not scheme:
        return

    latest_nav = get_nav_on_or_before(db, amfi_code, date.today())
    returns = compute_scheme_returns(db, amfi_code)

    latest_disclosure = (
        db.query(MonthlyDisclosureRow)
        .filter_by(amfi_code=amfi_code)
        .order_by(desc(MonthlyDisclosureRow.report_month))
        .first()
    )

    latest_te = (
        db.query(TrackingError)
        .filter_by(amfi_code=amfi_code, period_type="1Y")
        .order_by(desc(TrackingError.as_of_date))
        .first()
    )

    latest_td = (
        db.query(TrackingDifference)
        .filter_by(amfi_code=amfi_code)
        .order_by(desc(TrackingDifference.report_month))
        .first()
    )

    # 52-week high/low
    nav_52w_high, nav_52w_low = (None, None)
    if latest_nav:
        nav_52w_high, nav_52w_low = compute_52w_high_low(db, amfi_code, latest_nav.nav_date)

    # SIP returns
    sip_1y = compute_sip_return(db, amfi_code, 1)
    sip_3y = compute_sip_return(db, amfi_code, 3)
    sip_5y = compute_sip_return(db, amfi_code, 5)

    max_dd    = compute_max_drawdown(db, amfi_code)
    sortino   = compute_sortino_ratio(db, amfi_code)
    var95     = compute_var_95(db, amfi_code)
    ann_3y    = returns.get("return_3y")
    calmar    = compute_calmar_ratio(ann_3y, max_dd)

    # Risk ratios from latest quarterly disclosure
    latest_qd = (
        db.query(QuarterlyDisclosureRow)
        .filter_by(amfi_code=amfi_code)
        .order_by(desc(QuarterlyDisclosureRow.report_quarter))
        .first()
    )

    snapshot = db.query(SchemeAnalyticsSnapshot).filter_by(amfi_code=amfi_code).first()
    if not snapshot:
        snapshot = SchemeAnalyticsSnapshot(amfi_code=amfi_code)
        db.add(snapshot)

    snapshot.scheme_name = scheme.scheme_name
    snapshot.amc_name = scheme.amc_name
    snapshot.scheme_category = scheme.scheme_category
    snapshot.latest_nav = float(latest_nav.nav) if latest_nav else None
    snapshot.nav_date = latest_nav.nav_date if latest_nav else None
    snapshot.return_1w = returns.get("return_1w")
    snapshot.return_1m = returns.get("return_1m")
    snapshot.return_3m = returns.get("return_3m")
    snapshot.return_6m = returns.get("return_6m")
    snapshot.return_1y = returns.get("return_1y")
    snapshot.return_3y = returns.get("return_3y")
    snapshot.return_5y = returns.get("return_5y")
    snapshot.return_10y = returns.get("return_10y")
    snapshot.aum_cr = float(latest_disclosure.aum_cr) if latest_disclosure and latest_disclosure.aum_cr else None
    snapshot.expense_ratio = float(latest_disclosure.expense_ratio) if latest_disclosure and latest_disclosure.expense_ratio else None
    snapshot.tracking_error_1y = float(latest_te.tracking_error) if latest_te and latest_te.tracking_error else None
    snapshot.tracking_diff_latest = float(latest_td.tracking_difference) if latest_td and latest_td.tracking_difference else None
    snapshot.nav_52w_high   = nav_52w_high
    snapshot.nav_52w_low    = nav_52w_low
    snapshot.sip_return_1y  = sip_1y
    snapshot.sip_return_3y  = sip_3y
    snapshot.sip_return_5y  = sip_5y
    snapshot.sharpe_ratio   = float(latest_qd.sharpe_ratio) if latest_qd and latest_qd.sharpe_ratio else None
    snapshot.beta           = float(latest_qd.beta) if latest_qd and latest_qd.beta else None
    snapshot.std_deviation  = float(latest_qd.std_deviation) if latest_qd and latest_qd.std_deviation else None
    snapshot.max_drawdown    = max_dd
    snapshot.sortino_ratio   = sortino
    snapshot.var_95          = var95
    snapshot.calmar_ratio    = calmar
    from datetime import datetime
    snapshot.snapshot_refreshed_at = datetime.utcnow()
    db.commit()


def _compute_category_ranks(db: Session) -> None:
    """Rank schemes within each category by 1Y return (best=1)."""
    snaps = (
        db.query(SchemeAnalyticsSnapshot)
        .filter(SchemeAnalyticsSnapshot.return_1y.isnot(None))
        .all()
    )
    from collections import defaultdict
    by_cat: dict = defaultdict(list)
    for s in snaps:
        by_cat[s.scheme_category or "Unknown"].append(s)

    for cat_snaps in by_cat.values():
        cat_snaps.sort(key=lambda s: float(s.return_1y or 0), reverse=True)
        total = len(cat_snaps)
        for rank, s in enumerate(cat_snaps, 1):
            s.category_rank = rank
            s.category_count = total
            s.category_quartile = min(4, int((rank - 1) / total * 4) + 1)
    db.commit()


def refresh_all_snapshots(db: Session) -> dict:
    schemes = db.query(SchemeMaster.amfi_code).filter_by(is_active="Y").all()
    count = 0
    for (amfi_code,) in schemes:
        try:
            refresh_snapshot(db, amfi_code)
            count += 1
        except Exception as e:
            logger.error(f"Error refreshing snapshot for {amfi_code}: {e}")

    # Re-rank within categories by 1Y return
    _compute_category_ranks(db)
    return {"refreshed": count}
