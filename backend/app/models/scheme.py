from sqlalchemy import Column, BigInteger, String, Date, DateTime, Integer, Text, Numeric, func
from sqlalchemy.dialects.mysql import BIGINT, DATETIME, TEXT, VARCHAR
from app.database import Base


class SchemeMaster(Base):
    __tablename__ = "scheme_master"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    amfi_code = Column(String(50), nullable=False, index=True)
    isin_div_payout_growth = Column(String(50), index=True)
    isin_div_reinvestment = Column(String(50), index=True)
    scheme_name = Column(String(500), nullable=False)
    normalized_scheme_name = Column(String(500), index=True)
    amc_name = Column(String(255), index=True)
    fund_house = Column(String(255))
    category_header = Column(String(255))
    scheme_category = Column(String(255), index=True)
    scheme_type = Column(String(255))
    scheme_sub_type = Column(String(255))
    plan_type = Column(String(100))
    option_type = Column(String(100))
    is_active = Column(String(10), default="Y")
    effective_from = Column(Date)
    raw_line = Column(Text)          # Not indexed — MySQL TEXT requires prefix index
    face_value                 = Column(Numeric(18, 4))
    investment_objective       = Column(Text)
    fund_manager_name          = Column(String(500))
    fund_manager_experience    = Column(String(200))
    alternate_benchmark        = Column(String(500))
    min_investment_amount      = Column(Numeric(18, 2))
    additional_investment_amount = Column(Numeric(18, 2))
    sip_min_amount             = Column(Numeric(18, 2))
    dividend_frequency         = Column(String(100))
    maturity_type              = Column(String(100))
    exit_load                  = Column(String(500))
    entry_load                 = Column(String(500))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class AmcMaster(Base):
    __tablename__ = "amc_master"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    amc_name = Column(String(255), unique=True, nullable=False)
    fund_house = Column(String(255))
    amc_code = Column(String(50))
    scheme_count = Column(Integer)
    is_active = Column(String(10), default="Y")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class SchemeAliasMap(Base):
    __tablename__ = "scheme_alias_map"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    amfi_code = Column(String(50), index=True)
    canonical_scheme_name = Column(String(500), nullable=False)
    alias_scheme_name = Column(String(500), nullable=False)
    isin = Column(String(50))
    source_module = Column(String(100), nullable=False)
    confidence_score = Column(String(10))
    mapping_status = Column(String(50), default="AUTO")
    created_at = Column(DateTime, server_default=func.now())
