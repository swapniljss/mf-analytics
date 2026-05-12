from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal


class SchemeSnapshotOut(BaseModel):
    id: int
    amfi_code: str
    scheme_name: Optional[str] = None
    amc_name: Optional[str] = None
    scheme_category: Optional[str] = None
    latest_nav: Optional[Decimal] = None
    nav_date: Optional[date] = None
    return_1w: Optional[Decimal] = None
    return_1m: Optional[Decimal] = None
    return_3m: Optional[Decimal] = None
    return_6m: Optional[Decimal] = None
    return_1y: Optional[Decimal] = None
    return_3y: Optional[Decimal] = None
    return_5y: Optional[Decimal] = None
    return_10y: Optional[Decimal] = None
    since_inception: Optional[Decimal] = None
    inception_date: Optional[date] = None
    aum_cr: Optional[Decimal] = None
    expense_ratio: Optional[Decimal] = None
    tracking_error_1y: Optional[Decimal] = None
    tracking_diff_latest: Optional[Decimal] = None
    nav_52w_high: Optional[Decimal] = None
    nav_52w_low: Optional[Decimal] = None
    sip_return_1y: Optional[Decimal] = None
    sip_return_3y: Optional[Decimal] = None
    sip_return_5y: Optional[Decimal] = None
    sharpe_ratio: Optional[Decimal] = None
    beta: Optional[Decimal] = None
    std_deviation: Optional[Decimal] = None
    max_drawdown:      Optional[Decimal] = None
    sortino_ratio:     Optional[Decimal] = None
    calmar_ratio:      Optional[Decimal] = None
    var_95:            Optional[Decimal] = None
    category_rank:     Optional[int] = None
    category_count:    Optional[int] = None
    category_quartile: Optional[int] = None
    snapshot_refreshed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class NAVDataPoint(BaseModel):
    nav_date: date
    nav: Decimal


class SchemeReturnsOut(BaseModel):
    amfi_code: str
    scheme_name: str
    nav_history: List[NAVDataPoint]
    return_1w: Optional[float] = None
    return_1m: Optional[float] = None
    return_3m: Optional[float] = None
    return_6m: Optional[float] = None
    return_1y: Optional[float] = None
    return_3y: Optional[float] = None
    return_5y: Optional[float] = None


class TopPerformerOut(BaseModel):
    amfi_code: str
    scheme_name: str
    amc_name: Optional[str] = None
    scheme_category: Optional[str] = None
    return_value: Optional[Decimal] = None
    latest_nav: Optional[Decimal] = None
    aum_cr: Optional[Decimal] = None
