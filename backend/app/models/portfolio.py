from sqlalchemy import Column, BigInteger, String, Date, DateTime, Numeric, Text, Integer, func
from app.database import Base


class PortfolioUpload(Base):
    __tablename__ = "portfolio_upload"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    report_month = Column(String(7), nullable=False, index=True)   # YYYY-MM
    source_filename = Column(String(500), nullable=False)
    uploaded_by = Column(String(100))
    status = Column(String(50), default="PROCESSED")
    total_rows = Column(Integer)
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())


class PortfolioHolding(Base):
    __tablename__ = "portfolio_holding"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    upload_id = Column(BigInteger, index=True)
    report_month = Column(String(7), nullable=False, index=True)   # YYYY-MM
    amfi_code = Column(String(50), nullable=False, index=True)
    scheme_name = Column(String(500))
    company_name = Column(String(500), nullable=False)
    company_isin = Column(String(50), index=True)
    sector = Column(String(255), index=True)
    quantity = Column(Numeric(24, 4))
    market_value_cr = Column(Numeric(20, 6))
    percentage_exposure = Column(Numeric(8, 4))
    security_class = Column(String(100))      # EQUITY / DEBT / GOV_SEC / T-BILL / OTHERS
    rating = Column(String(50))
    rating_agency = Column(String(100))
    avg_maturity_years = Column(Numeric(10, 4))
    modified_duration = Column(Numeric(10, 4))
    created_at = Column(DateTime, server_default=func.now())
