from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel


class PfmOut(BaseModel):
    pfm_code:  str
    pfm_name:  str

    class Config:
        from_attributes = True


class SchemeOut(BaseModel):
    scheme_code:  str
    pfm_code:     str
    scheme_name:  str
    asset_class:  str
    tier:         str
    variant:      str
    category:     str
    is_apy:       int

    class Config:
        from_attributes = True


class NavPointOut(BaseModel):
    nav_date: date
    nav:      float

    class Config:
        from_attributes = True


class UploadResult(BaseModel):
    filename:  str
    nav_date:  Optional[str] = None
    records:   int
    inserted:  int


class SnapshotOut(BaseModel):
    scheme_code:  str
    pfm_code:     Optional[str]
    pfm_name:     Optional[str]
    scheme_name:  Optional[str]
    asset_class:  Optional[str]
    tier:         Optional[str]
    variant:      Optional[str]
    category:     Optional[str]
    is_apy:       Optional[int]

    latest_nav:    Optional[float]
    nav_date:      Optional[date]
    nav_52w_high:  Optional[float]
    nav_52w_low:   Optional[float]

    return_1w:   Optional[float]
    return_1m:   Optional[float]
    return_3m:   Optional[float]
    return_6m:   Optional[float]
    return_1y:   Optional[float]
    return_3y:   Optional[float]
    return_5y:   Optional[float]
    return_10y:  Optional[float]
    return_max:  Optional[float]

    sharpe_ratio:   Optional[float]
    sortino_ratio:  Optional[float]
    max_drawdown:   Optional[float]
    volatility_1y:  Optional[float]
    calmar_ratio:   Optional[float]
    var_95:         Optional[float]

    category_rank:     Optional[int]
    category_count:    Optional[int]
    category_quartile: Optional[int]

    snapshot_refreshed_at: Optional[datetime]

    class Config:
        from_attributes = True


class RefreshResult(BaseModel):
    refreshed: int
    errors:    int
