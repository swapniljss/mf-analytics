from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from decimal import Decimal


class TrackingErrorOut(BaseModel):
    id: int
    amfi_code: str
    scheme_name: str
    amc_name: Optional[str] = None
    benchmark_name: Optional[str] = None
    tracking_error: Optional[Decimal] = None
    period_type: Optional[str] = None
    as_of_date: Optional[date] = None

    class Config:
        from_attributes = True


class TrackingDifferenceOut(BaseModel):
    id: int
    amfi_code: str
    scheme_name: str
    amc_name: Optional[str] = None
    benchmark_name: Optional[str] = None
    tracking_difference: Optional[Decimal] = None
    report_month: Optional[date] = None

    class Config:
        from_attributes = True


class TrackingSyncLogOut(BaseModel):
    id: int
    data_type: Optional[str] = None
    status: Optional[str] = None
    records_fetched: Optional[int] = None
    records_upserted: Optional[int] = None
    message: Optional[str] = None
    as_of_date: Optional[date] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
