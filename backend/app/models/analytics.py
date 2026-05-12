from sqlalchemy import Column, BigInteger, Integer, String, Date, DateTime, Numeric, func
from app.database import Base


class SchemeAnalyticsSnapshot(Base):
    __tablename__ = "scheme_analytics_snapshot"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    amfi_code = Column(String(50), unique=True, nullable=False, index=True)
    scheme_name = Column(String(500))
    amc_name = Column(String(255), index=True)
    scheme_category = Column(String(255), index=True)
    latest_nav = Column(Numeric(18, 6))
    nav_date = Column(Date, index=True)
    return_1w = Column(Numeric(10, 6))
    return_1m = Column(Numeric(10, 6))
    return_3m = Column(Numeric(10, 6))
    return_6m = Column(Numeric(10, 6))
    return_1y = Column(Numeric(10, 6))
    return_3y = Column(Numeric(10, 6))
    return_5y = Column(Numeric(10, 6))
    return_10y = Column(Numeric(10, 6))
    since_inception = Column(Numeric(10, 6))
    inception_date = Column(Date)
    aum_cr = Column(Numeric(20, 6))
    expense_ratio = Column(Numeric(8, 4))
    tracking_error_1y = Column(Numeric(10, 6))
    tracking_diff_latest = Column(Numeric(10, 6))
    nav_52w_high = Column(Numeric(18, 6))
    nav_52w_low  = Column(Numeric(18, 6))
    sip_return_1y = Column(Numeric(10, 6))
    sip_return_3y = Column(Numeric(10, 6))
    sip_return_5y = Column(Numeric(10, 6))
    sharpe_ratio  = Column(Numeric(10, 6))
    beta          = Column(Numeric(10, 6))
    std_deviation = Column(Numeric(10, 6))
    max_drawdown       = Column(Numeric(10, 6))   # % drawdown, positive = bad
    sortino_ratio      = Column(Numeric(10, 6))
    calmar_ratio       = Column(Numeric(10, 6))
    var_95             = Column(Numeric(10, 6))   # 1-day VaR at 95% confidence (% loss)
    category_rank      = Column(Integer)
    category_count     = Column(Integer)
    category_quartile  = Column(Integer)          # 1=best, 4=worst
    snapshot_refreshed_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
