from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from decimal import Decimal


class NavPriceOut(BaseModel):
    id: int
    amfi_code: str
    scheme_name: str
    nav: Optional[Decimal] = None
    nav_date: Optional[date] = None
    repurchase_price: Optional[Decimal] = None
    sale_price: Optional[Decimal] = None
    source_type: Optional[str] = None

    class Config:
        from_attributes = True


class DailyNAVOut(BaseModel):
    id: int
    amfi_code: str
    scheme_name: str
    nav: Optional[Decimal] = None
    nav_date: Optional[date] = None
    fund_house: Optional[str] = None
    isin_div_payout_growth: Optional[str] = None
    isin_div_reinvestment: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class HistoricalNAVBatchOut(BaseModel):
    id: int
    batch_name: str
    source_filename: str
    status: Optional[str] = None
    total_rows: Optional[int] = None
    inserted_rows: Optional[int] = None
    updated_rows: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
