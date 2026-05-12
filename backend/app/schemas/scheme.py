from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from decimal import Decimal


class SchemeMasterOut(BaseModel):
    id: int
    amfi_code: str
    isin_div_payout_growth: Optional[str] = None
    isin_div_reinvestment: Optional[str] = None
    scheme_name: str
    amc_name: Optional[str] = None
    fund_house: Optional[str] = None
    scheme_category: Optional[str] = None
    scheme_type: Optional[str] = None
    plan_type: Optional[str] = None
    option_type: Optional[str] = None
    is_active: Optional[str] = None
    effective_from: Optional[date] = None
    created_at: Optional[datetime] = None
    face_value: Optional[Decimal] = None
    investment_objective: Optional[str] = None
    fund_manager_name: Optional[str] = None
    fund_manager_experience: Optional[str] = None
    alternate_benchmark: Optional[str] = None
    min_investment_amount: Optional[Decimal] = None
    additional_investment_amount: Optional[Decimal] = None
    sip_min_amount: Optional[Decimal] = None
    dividend_frequency: Optional[str] = None
    maturity_type: Optional[str] = None
    exit_load: Optional[str] = None
    entry_load: Optional[str] = None

    class Config:
        from_attributes = True


class AmcMasterOut(BaseModel):
    id: int
    amc_name: str
    fund_house: Optional[str] = None
    amc_code: Optional[str] = None
    scheme_count: Optional[int] = None
    is_active: Optional[str] = None

    class Config:
        from_attributes = True
