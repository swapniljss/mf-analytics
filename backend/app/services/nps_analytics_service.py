"""
NPS / APY analytics — returns, risk metrics, snapshots.

Reuses the same math as analytics_service.py but reads from nps_nav
and writes to nps_analytics_snapshot.
"""

import math
import logging
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import desc, func as sqlfunc
from sqlalchemy.orm import Session

from app.models.nps import NPSNav, NPSScheme, NPSPfm, NPSAnalyticsSnapshot

logger = logging.getLogger(__name__)

RISK_FREE_RATE = 0.065   # 6.5% per annum


# ── NAV lookup helpers ────────────────────────────────────────────────────────

def _nav_on_or_before(db: Session, scheme_code: str, target_date: date) -> Optional[NPSNav]:
    return (
        db.query(NPSNav)
        .filter(NPSNav.scheme_code == scheme_code, NPSNav.nav_date <= target_date)
        .order_by(desc(NPSNav.nav_date))
        .first()
    )


def _navs_since(db: Session, scheme_code: str, from_date: date) -> list[tuple[date, float]]:
    rows = (
        db.query(NPSNav.nav_date, NPSNav.nav)
        .filter(NPSNav.scheme_code == scheme_code, NPSNav.nav_date >= from_date)
        .order_by(NPSNav.nav_date)
        .all()
    )
    return [(r[0], float(r[1])) for r in rows]


# ── return computations ───────────────────────────────────────────────────────

def _cagr(nav_start: float, nav_end: float, years: float) -> Optional[float]:
    if nav_start <= 0 or years <= 0:
        return None
    return round(((nav_end / nav_start) ** (1 / years) - 1) * 100, 4)


def _absolute_return(nav_start: float, nav_end: float) -> float:
    return round((nav_end - nav_start) / nav_start * 100, 4)


def compute_nps_returns(db: Session, scheme_code: str) -> dict:
    latest = _nav_on_or_before(db, scheme_code, date.today())
    if not latest:
        return {}

    today    = latest.nav_date
    nav_end  = float(latest.nav)

    def _get(days: int, years: float) -> Optional[float]:
        past_date = today - timedelta(days=days)
        past = _nav_on_or_before(db, scheme_code, past_date)
        if not past:
            return None
        # reject if actual record is too far from target lookback
        if (past_date - past.nav_date).days > days:
            return None
        nav_s = float(past.nav)
        return _absolute_return(nav_s, nav_end) if years <= 1 else _cagr(nav_s, nav_end, years)

    # Return since inception
    oldest = (
        db.query(NPSNav)
        .filter(NPSNav.scheme_code == scheme_code)
        .order_by(NPSNav.nav_date)
        .first()
    )
    return_max = None
    if oldest and oldest.nav_date < today:
        years_since = (today - oldest.nav_date).days / 365.25
        nav_inception = float(oldest.nav)
        if years_since >= 1:
            return_max = _cagr(nav_inception, nav_end, years_since)
        else:
            return_max = _absolute_return(nav_inception, nav_end)

    return {
        "return_1w":  _get(7,    7 / 365),
        "return_1m":  _get(30,   30 / 365),
        "return_3m":  _get(91,   91 / 365),
        "return_6m":  _get(182,  182 / 365),
        "return_1y":  _get(365,  1),
        "return_3y":  _get(1095, 3),
        "return_5y":  _get(1825, 5),
        "return_10y": _get(3650, 10),
        "return_max": return_max,
    }


# ── risk metrics ──────────────────────────────────────────────────────────────

def compute_nps_52w_high_low(db: Session, scheme_code: str, as_of: date) -> tuple:
    start = as_of - timedelta(days=365)
    result = (
        db.query(sqlfunc.max(NPSNav.nav), sqlfunc.min(NPSNav.nav))
        .filter(NPSNav.scheme_code == scheme_code, NPSNav.nav_date >= start, NPSNav.nav_date <= as_of)
        .first()
    )
    if result and result[0]:
        return float(result[0]), float(result[1])
    return None, None


def compute_nps_volatility(db: Session, scheme_code: str, years: int = 1) -> Optional[float]:
    """Annualised standard deviation of daily returns (%)."""
    from_date = date.today() - timedelta(days=years * 365)
    navs = _navs_since(db, scheme_code, from_date)
    if len(navs) < 30:
        return None
    daily_ret = [(navs[i][1] - navs[i-1][1]) / navs[i-1][1] for i in range(1, len(navs))]
    n = len(daily_ret)
    mean = sum(daily_ret) / n
    variance = sum((r - mean) ** 2 for r in daily_ret) / n
    ann_vol = math.sqrt(variance * 252) * 100
    return round(ann_vol, 4)


def compute_nps_sharpe(db: Session, scheme_code: str, years: int = 3) -> Optional[float]:
    """Sharpe Ratio = (Annualised Return − Risk-Free) / Annualised Volatility."""
    from_date = date.today() - timedelta(days=years * 365)
    navs = _navs_since(db, scheme_code, from_date)
    if len(navs) < 60:
        return None
    daily_ret = [(navs[i][1] - navs[i-1][1]) / navs[i-1][1] for i in range(1, len(navs))]
    n = len(daily_ret)
    mean = sum(daily_ret) / n
    ann_return = (1 + mean) ** 252 - 1
    variance = sum((r - mean) ** 2 for r in daily_ret) / n
    ann_vol = math.sqrt(variance * 252)
    if ann_vol < 1e-10:
        return None
    return round((ann_return - RISK_FREE_RATE) / ann_vol, 4)


def compute_nps_sortino(db: Session, scheme_code: str, years: int = 3) -> Optional[float]:
    """Sortino Ratio = (Annualised Return − Risk-Free) / Downside Deviation."""
    from_date = date.today() - timedelta(days=years * 365)
    navs = _navs_since(db, scheme_code, from_date)
    if len(navs) < 60:
        return None
    daily_ret = [(navs[i][1] - navs[i-1][1]) / navs[i-1][1] for i in range(1, len(navs))]
    mean = sum(daily_ret) / len(daily_ret)
    ann_return = (1 + mean) ** 252 - 1
    daily_rfr  = (1 + RISK_FREE_RATE) ** (1 / 252) - 1
    downside = [min(0.0, r - daily_rfr) for r in daily_ret]
    downside_dev = math.sqrt(sum(r ** 2 for r in downside) / len(downside)) * math.sqrt(252)
    if downside_dev < 1e-10:
        return None
    return round((ann_return - RISK_FREE_RATE) / downside_dev, 4)


def compute_nps_max_drawdown(db: Session, scheme_code: str, years: int = 3) -> Optional[float]:
    """Max peak-to-trough decline over last `years` years (positive % = loss)."""
    from_date = date.today() - timedelta(days=years * 365)
    navs = _navs_since(db, scheme_code, from_date)
    if len(navs) < 10:
        return None
    peak = navs[0][1]
    max_dd = 0.0
    for _, nav_val in navs:
        if nav_val > peak:
            peak = nav_val
        dd = (peak - nav_val) / peak * 100 if peak > 0 else 0.0
        if dd > max_dd:
            max_dd = dd
    return round(max_dd, 4) if max_dd > 0 else None


def compute_nps_var_95(db: Session, scheme_code: str, years: int = 1) -> Optional[float]:
    """Historical 1-day VaR at 95% confidence (positive = potential % loss)."""
    from_date = date.today() - timedelta(days=years * 365)
    navs = _navs_since(db, scheme_code, from_date)
    if len(navs) < 30:
        return None
    daily_ret = sorted([(navs[i][1] - navs[i-1][1]) / navs[i-1][1] * 100 for i in range(1, len(navs))])
    idx = max(0, int(len(daily_ret) * 0.05) - 1)
    return round(-daily_ret[idx], 4)


# ── snapshot ──────────────────────────────────────────────────────────────────

def refresh_nps_snapshot(db: Session, scheme_code: str) -> None:
    scheme = db.query(NPSScheme).filter_by(scheme_code=scheme_code, is_active=1).first()
    if not scheme:
        return

    pfm = db.query(NPSPfm).filter_by(pfm_code=scheme.pfm_code).first()

    latest = _nav_on_or_before(db, scheme_code, date.today())
    returns = compute_nps_returns(db, scheme_code)

    nav_52w_high, nav_52w_low = (None, None)
    if latest:
        nav_52w_high, nav_52w_low = compute_nps_52w_high_low(db, scheme_code, latest.nav_date)

    max_dd   = compute_nps_max_drawdown(db, scheme_code)
    sharpe   = compute_nps_sharpe(db, scheme_code)
    sortino  = compute_nps_sortino(db, scheme_code)
    vol      = compute_nps_volatility(db, scheme_code)
    var95    = compute_nps_var_95(db, scheme_code)
    ann_3y   = returns.get("return_3y")
    calmar   = round(ann_3y / max_dd, 4) if ann_3y and max_dd and max_dd > 0 else None

    snap = db.query(NPSAnalyticsSnapshot).filter_by(scheme_code=scheme_code).first()
    if not snap:
        snap = NPSAnalyticsSnapshot(scheme_code=scheme_code)
        db.add(snap)

    snap.pfm_code    = scheme.pfm_code
    snap.pfm_name    = pfm.pfm_name if pfm else None
    snap.scheme_name = scheme.scheme_name
    snap.asset_class = scheme.asset_class
    snap.tier        = scheme.tier
    snap.variant     = scheme.variant
    snap.category    = scheme.category
    snap.is_apy      = scheme.is_apy

    snap.latest_nav   = float(latest.nav) if latest else None
    snap.nav_date     = latest.nav_date if latest else None
    snap.nav_52w_high = nav_52w_high
    snap.nav_52w_low  = nav_52w_low

    snap.return_1w   = returns.get("return_1w")
    snap.return_1m   = returns.get("return_1m")
    snap.return_3m   = returns.get("return_3m")
    snap.return_6m   = returns.get("return_6m")
    snap.return_1y   = returns.get("return_1y")
    snap.return_3y   = returns.get("return_3y")
    snap.return_5y   = returns.get("return_5y")
    snap.return_10y  = returns.get("return_10y")
    snap.return_max  = returns.get("return_max")

    snap.sharpe_ratio  = sharpe
    snap.sortino_ratio = sortino
    snap.max_drawdown  = max_dd
    snap.volatility_1y = vol
    snap.calmar_ratio  = calmar
    snap.var_95        = var95

    snap.snapshot_refreshed_at = datetime.utcnow()
    db.commit()


def _rank_by_category(db: Session) -> None:
    """Rank schemes within each category by 1Y return (best=1)."""
    snaps = (
        db.query(NPSAnalyticsSnapshot)
        .filter(NPSAnalyticsSnapshot.return_1y.isnot(None))
        .all()
    )
    by_cat: dict = defaultdict(list)
    for s in snaps:
        by_cat[(s.category or "OTHER", s.asset_class or "NA", s.tier or "NA")].append(s)

    for group_snaps in by_cat.values():
        group_snaps.sort(key=lambda s: float(s.return_1y or 0), reverse=True)
        total = len(group_snaps)
        for rank, s in enumerate(group_snaps, 1):
            s.category_rank      = rank
            s.category_count     = total
            s.category_quartile  = min(4, int((rank - 1) / total * 4) + 1)
    db.commit()


def refresh_all_nps_snapshots(db: Session) -> dict:
    schemes = db.query(NPSScheme.scheme_code).filter(NPSScheme.is_active == 1).all()
    count = errors = 0
    for (scheme_code,) in schemes:
        try:
            refresh_nps_snapshot(db, scheme_code)
            count += 1
        except Exception as e:
            logger.error(f"NPS snapshot error {scheme_code}: {e}")
            errors += 1

    _rank_by_category(db)
    logger.info(f"NPS snapshots refreshed: {count} ok, {errors} errors")
    return {"refreshed": count, "errors": errors}
