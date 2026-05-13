import bisect
import logging
import math
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


# ─────────────────────────────────────────────────────────────────────────────
# In-memory helpers used ONLY by refresh_snapshot() below.
#
# Each mirrors the same-named DB-query helper above (compute_* without _inmem)
# 1:1 — same windows, same min-data thresholds, same gap-rejection, same math.
# The only difference: they accept a pre-sorted NAV array (one bulk fetch up
# front) instead of issuing one query per lookup. This is the core of Fix #6.
#
# The DB-query helpers are intentionally KEPT — other endpoints
# (/analytics/scheme/{code}/returns, /goal/*) still import them.
# ─────────────────────────────────────────────────────────────────────────────


def _get_nav_before_inmem(dates_arr, navs_arr, target_date):
    """In-memory mirror of get_nav_on_or_before. Returns (date, nav) or None.

    Uses binary search over the date-sorted parallel arrays. Identical semantics
    to the DB query `... WHERE nav_date <= target ORDER BY nav_date DESC LIMIT 1`.
    """
    idx = bisect.bisect_right(dates_arr, target_date) - 1
    if idx < 0:
        return None
    return dates_arr[idx], navs_arr[idx]


def _compute_returns_inmem(dates_arr, navs_arr, anchor_date, anchor_nav):
    """In-memory mirror of compute_scheme_returns.

    `anchor_date` is the latest NAV date (matches the original which uses
    `latest = get_nav_on_or_before(today); today = latest.nav_date`).
    `anchor_nav` is the NAV on that date.
    Returns dict with same 8 keys as the original.
    """
    def get_return(days: int, years: float):
        past_date = anchor_date - timedelta(days=days)
        result = _get_nav_before_inmem(dates_arr, navs_arr, past_date)
        if not result:
            return None
        found_date, past_nav = result
        # Same gap rule as compute_scheme_returns: reject if the actual NAV
        # is more than `days` calendar days before the target — meaningless
        # to use a 2-year-old NAV for a "1 week" return.
        if (past_date - found_date).days > days:
            return None
        if past_nav <= 0:
            return None
        if years <= 1:
            return ((anchor_nav - past_nav) / past_nav) * 100
        return ((anchor_nav / past_nav) ** (1 / years) - 1) * 100

    return {
        "return_1w":  get_return(7,    7 / 365),
        "return_1m":  get_return(30,   30 / 365),
        "return_3m":  get_return(91,   91 / 365),
        "return_6m":  get_return(182,  182 / 365),
        "return_1y":  get_return(365,  1),
        "return_3y":  get_return(1095, 3),
        "return_5y":  get_return(1825, 5),
        "return_10y": get_return(3650, 10),
    }


def _compute_52w_inmem(dates_arr, navs_arr, as_of: date):
    """In-memory mirror of compute_52w_high_low.

    Window: [as_of - 365 days, as_of] inclusive — same as the SQL filter.
    Returns (high, low) NAV in the window, or (None, None) if empty.
    """
    start = as_of - timedelta(days=365)
    lo = bisect.bisect_left(dates_arr, start)
    hi = bisect.bisect_right(dates_arr, as_of)
    if lo >= hi:
        return None, None
    window = navs_arr[lo:hi]
    return max(window), min(window)


def _compute_max_drawdown_inmem(dates_arr, navs_arr, years: int = 3):
    """In-memory mirror of compute_max_drawdown.

    Largest peak-to-trough decline % over the last `years` years.
    Uses `date.today()` for the cutoff — same as the original (NOT the latest
    NAV date — preserve original behavior even though the two can differ by
    a day or two).
    """
    from_date = date.today() - timedelta(days=years * 365)
    lo = bisect.bisect_left(dates_arr, from_date)
    series = navs_arr[lo:]
    if len(series) < 10:
        return None
    peak = series[0]
    max_dd = 0.0
    for nav_f in series:
        if nav_f > peak:
            peak = nav_f
        dd = (peak - nav_f) / peak * 100 if peak > 0 else 0.0
        if dd > max_dd:
            max_dd = dd
    return round(max_dd, 4) if max_dd > 0 else None


def _compute_sortino_inmem(dates_arr, navs_arr, years: int = 3,
                            risk_free_rate: float = 0.065):
    """In-memory mirror of compute_sortino_ratio.

    Identical formula: ann_return = (1 + avg_daily)^252 - 1;
    downside_dev = sqrt(mean(min(0, r - daily_rfr)^2)) * sqrt(252);
    sortino = (ann_return - rfr) / downside_dev.
    """
    from_date = date.today() - timedelta(days=years * 365)
    lo = bisect.bisect_left(dates_arr, from_date)
    series = navs_arr[lo:]
    if len(series) < 60:
        return None
    daily_returns = []
    for i in range(1, len(series)):
        prev = series[i - 1]
        curr = series[i]
        if prev > 0:
            daily_returns.append((curr - prev) / prev)
    if len(daily_returns) < 30:
        return None
    avg = sum(daily_returns) / len(daily_returns)
    ann_return = (1 + avg) ** 252 - 1
    daily_rfr = (1 + risk_free_rate) ** (1 / 252) - 1
    downside = [min(0.0, r - daily_rfr) for r in daily_returns]
    downside_dev = math.sqrt(sum(r ** 2 for r in downside) / len(downside)) * math.sqrt(252)
    if downside_dev < 1e-10:
        return None
    return round((ann_return - risk_free_rate) / downside_dev, 4)


def _compute_var_95_inmem(dates_arr, navs_arr, years: int = 1):
    """In-memory mirror of compute_var_95. Historical 1-day VaR @ 95%."""
    from_date = date.today() - timedelta(days=years * 365)
    lo = bisect.bisect_left(dates_arr, from_date)
    series = navs_arr[lo:]
    if len(series) < 30:
        return None
    daily_returns = []
    for i in range(1, len(series)):
        prev = series[i - 1]
        curr = series[i]
        if prev > 0:
            daily_returns.append((curr - prev) / prev * 100)
    if len(daily_returns) < 20:
        return None
    daily_returns.sort()
    idx = max(0, int(len(daily_returns) * 0.05) - 1)
    return round(-daily_returns[idx], 4)


def _compute_sip_return_inmem(dates_arr, navs_arr, years: int):
    """In-memory mirror of compute_sip_return (Newton-Raphson XIRR).

    Same initial guess (12 %), same convergence tolerances, same clamping
    range, same monthly investment schedule keyed off `date.today()`.
    """
    from dateutil.relativedelta import relativedelta

    today = date.today()
    start = today - relativedelta(years=years)

    inv_dates = []
    d = start
    while d <= today:
        inv_dates.append(d)
        d += relativedelta(months=1)
    if len(inv_dates) < 6:
        return None

    nav_map = {}
    for inv_d in inv_dates:
        result = _get_nav_before_inmem(dates_arr, navs_arr, inv_d)
        if result:
            nav_map[inv_d] = result[1]

    if len(nav_map) < max(6, len(inv_dates) // 2):
        return None

    valid_dates = sorted(nav_map.keys())
    latest_nav_val = nav_map[valid_dates[-1]]

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

    r = 0.12
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


# ─────────────────────────────────────────────────────────────────────────────
# Refactored refresh_snapshot — one bulk NAV fetch per scheme, all math
# in memory. Same output as the previous implementation (within rounding).
# ─────────────────────────────────────────────────────────────────────────────


def refresh_snapshot(db: Session, amfi_code: str) -> None:
    scheme = db.query(SchemeMaster).filter_by(amfi_code=amfi_code, is_active="Y").first()
    if not scheme:
        return

    # ── ONE bulk fetch: every NAV row for this scheme, sorted ascending. ──
    # Replaces ~130 small per-period queries that the old implementation made.
    # Backed by the idx_amficode_date_desc index (added in Fix #1).
    nav_rows = (
        db.query(NavPrice.nav_date, NavPrice.nav)
        .filter(NavPrice.amfi_code == amfi_code)
        .order_by(NavPrice.nav_date)
        .all()
    )
    # Parallel arrays — keep duplicates from daily/historical union as-is,
    # matching the original iterator-style helpers.
    dates_arr = [r[0] for r in nav_rows]
    navs_arr  = [float(r[1]) for r in nav_rows]

    # Latest NAV ≤ today — mirrors original `get_nav_on_or_before(today)`,
    # not just `dates_arr[-1]`, in case the DB has a stray future date.
    latest_pair = _get_nav_before_inmem(dates_arr, navs_arr, date.today())
    if latest_pair:
        latest_date, latest_nav_val = latest_pair
    else:
        latest_date, latest_nav_val = None, None

    # ── All NAV-derived metrics computed in-memory ──────────────────────────
    if latest_date is not None:
        returns = _compute_returns_inmem(dates_arr, navs_arr, latest_date, latest_nav_val)
        nav_52w_high, nav_52w_low = _compute_52w_inmem(dates_arr, navs_arr, latest_date)
    else:
        returns = {}
        nav_52w_high, nav_52w_low = None, None

    max_dd  = _compute_max_drawdown_inmem(dates_arr, navs_arr)
    sortino = _compute_sortino_inmem(dates_arr, navs_arr)
    var95   = _compute_var_95_inmem(dates_arr, navs_arr)
    sip_1y  = _compute_sip_return_inmem(dates_arr, navs_arr, 1)
    sip_3y  = _compute_sip_return_inmem(dates_arr, navs_arr, 3)
    sip_5y  = _compute_sip_return_inmem(dates_arr, navs_arr, 5)
    ann_3y  = returns.get("return_3y")
    calmar  = compute_calmar_ratio(ann_3y, max_dd)

    # ── 4 small queries for disclosure + tracking (unchanged) ────────────────
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
    latest_qd = (
        db.query(QuarterlyDisclosureRow)
        .filter_by(amfi_code=amfi_code)
        .order_by(desc(QuarterlyDisclosureRow.report_quarter))
        .first()
    )

    # ── Upsert snapshot row (identical field set to the previous version) ──
    snapshot = db.query(SchemeAnalyticsSnapshot).filter_by(amfi_code=amfi_code).first()
    if not snapshot:
        snapshot = SchemeAnalyticsSnapshot(amfi_code=amfi_code)
        db.add(snapshot)

    snapshot.scheme_name = scheme.scheme_name
    snapshot.amc_name = scheme.amc_name
    snapshot.scheme_category = scheme.scheme_category
    snapshot.latest_nav = latest_nav_val
    snapshot.nav_date = latest_date
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
