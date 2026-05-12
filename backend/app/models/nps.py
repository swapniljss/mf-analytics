"""
NPS / APY data models.

Tables:
  nps_pfm                  — Pension Fund Manager master (10 PFMs)
  nps_scheme               — Scheme master with auto-classification
  nps_nav                  — Daily NAV history
  nps_analytics_snapshot   — Pre-computed returns + risk metrics (1 row per scheme)
"""

from sqlalchemy import (
    Column, BigInteger, Integer, String, Date, DateTime,
    Numeric, SmallInteger, func, UniqueConstraint,
)
from app.database import Base

_CHARSET = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}


class NPSPfm(Base):
    """Pension Fund Manager master — one row per PFM."""
    __tablename__ = "nps_pfm"
    __table_args__ = (
        _CHARSET,
    )

    id        = Column(Integer, primary_key=True, autoincrement=True)
    pfm_code  = Column(String(20), nullable=False, unique=True, index=True)   # PFM001 … PFM014
    pfm_name  = Column(String(300), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class NPSScheme(Base):
    """
    Scheme master.

    asset_class  E=Equity  C=Corporate Bonds  G=Govt Securities  A=Alternate  NA=Not applicable
    tier         I=Tier-I  II=Tier-II  NA=Not applicable
    variant      POP=Point of Presence  DIRECT=Direct  GS=Govt Sector  NA=Not applicable
    category     Broad scheme category (APY / NPS / CENTRAL_GOVT / …)
    """
    __tablename__ = "nps_scheme"
    __table_args__ = (
        _CHARSET,
    )

    id           = Column(Integer, primary_key=True, autoincrement=True)
    scheme_code  = Column(String(20), nullable=False, unique=True, index=True)  # SM001001 …
    pfm_code     = Column(String(20), nullable=False, index=True)
    scheme_name  = Column(String(400), nullable=False)

    # ── auto-classified fields ─────────────────────────────────────────────
    asset_class  = Column(String(5),   nullable=False, default="NA")   # E/C/G/A/NA
    tier         = Column(String(5),   nullable=False, default="NA")   # I/II/NA
    variant      = Column(String(10),  nullable=False, default="NA")   # POP/DIRECT/GS/NA
    category     = Column(String(30),  nullable=False, default="NPS")
    # APY / APY_FUND / CENTRAL_GOVT / STATE_GOVT / NPS_LITE / CORPORATE_CG /
    # UPS / TAX_SAVER / COMPOSITE / VATSALYA / RETIREMENT_YOJANA / NPS

    is_apy       = Column(SmallInteger, nullable=False, server_default="0")   # 1 if APY scheme
    is_active    = Column(SmallInteger, nullable=False, server_default="1")
    created_at   = Column(DateTime, server_default=func.now())
    updated_at   = Column(DateTime, server_default=func.now(), onupdate=func.now())


class NPSNav(Base):
    """Daily NAV — one row per (scheme_code, nav_date)."""
    __tablename__ = "nps_nav"
    __table_args__ = (
        UniqueConstraint("scheme_code", "nav_date", name="uq_nps_nav_code_date"),
        _CHARSET,
    )

    id          = Column(BigInteger, primary_key=True, autoincrement=True)
    scheme_code = Column(String(20), nullable=False, index=True)
    nav_date    = Column(Date, nullable=False, index=True)
    nav         = Column(Numeric(14, 4), nullable=False)
    created_at  = Column(DateTime, server_default=func.now())


class NPSAnalyticsSnapshot(Base):
    """
    One row per scheme — pre-computed analytics snapshot.
    Refreshed via POST /nps/analytics/refresh.
    """
    __tablename__ = "nps_analytics_snapshot"
    __table_args__ = (
        _CHARSET,
    )

    id           = Column(BigInteger, primary_key=True, autoincrement=True)
    scheme_code  = Column(String(20), nullable=False, unique=True, index=True)
    pfm_code     = Column(String(20), index=True)
    pfm_name     = Column(String(300))
    scheme_name  = Column(String(400))
    asset_class  = Column(String(5))
    tier         = Column(String(5))
    variant      = Column(String(10))
    category     = Column(String(30), index=True)
    is_apy       = Column(SmallInteger, default=0)

    latest_nav   = Column(Numeric(14, 4))
    nav_date     = Column(Date, index=True)
    nav_52w_high = Column(Numeric(14, 4))
    nav_52w_low  = Column(Numeric(14, 4))

    return_1w    = Column(Numeric(10, 4))
    return_1m    = Column(Numeric(10, 4))
    return_3m    = Column(Numeric(10, 4))
    return_6m    = Column(Numeric(10, 4))
    return_1y    = Column(Numeric(10, 4))
    return_3y    = Column(Numeric(10, 4))
    return_5y    = Column(Numeric(10, 4))
    return_10y   = Column(Numeric(10, 4))
    return_max   = Column(Numeric(10, 4))   # since inception

    sharpe_ratio    = Column(Numeric(10, 4))
    sortino_ratio   = Column(Numeric(10, 4))
    max_drawdown    = Column(Numeric(10, 4))   # positive % = peak-to-trough loss
    volatility_1y   = Column(Numeric(10, 4))   # annualised std dev of daily returns
    calmar_ratio    = Column(Numeric(10, 4))
    var_95          = Column(Numeric(10, 4))   # 1-day VaR at 95% confidence (% loss)

    # Ranking within category (by 1Y return, best=1)
    category_rank      = Column(Integer)
    category_count     = Column(Integer)
    category_quartile  = Column(Integer)   # 1=best, 4=worst

    snapshot_refreshed_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
