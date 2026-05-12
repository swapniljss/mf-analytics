from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from decimal import Decimal


class AumSchemeOut(BaseModel):
    id: int
    fy_id: int
    period_id: int
    fy_label: Optional[str] = None
    period_label: Optional[str] = None
    amfi_code: Optional[str] = None
    scheme_name: str
    amc_name: Optional[str] = None
    scheme_category: Optional[str] = None
    average_aum_cr: Optional[Decimal] = None
    fof_aum_cr: Optional[Decimal] = None
    folio_count: Optional[int] = None

    class Config:
        from_attributes = True


class AumFundOut(BaseModel):
    id: int
    fy_id: int
    period_id: int
    fy_label: Optional[str] = None
    period_label: Optional[str] = None
    amc_name: str
    total_aum_cr: Optional[Decimal] = None
    fof_aum_cr: Optional[Decimal] = None
    equity_aum_cr: Optional[Decimal] = None
    debt_aum_cr: Optional[Decimal] = None
    hybrid_aum_cr: Optional[Decimal] = None
    other_aum_cr: Optional[Decimal] = None
    folio_count: Optional[int] = None

    class Config:
        from_attributes = True


class AumSyncLogOut(BaseModel):
    id: int
    data_type: Optional[str] = None
    fy_id: Optional[int] = None
    period_id: Optional[int] = None
    status: Optional[str] = None
    records_fetched: Optional[int] = None
    records_upserted: Optional[int] = None
    message: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
