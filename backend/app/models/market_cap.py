from sqlalchemy import Column, BigInteger, String, Date, DateTime, Integer, Numeric, Text, func
from app.database import Base


class MarketCapCategorizationUpload(Base):
    __tablename__ = "market_cap_categorization_upload"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    effective_date = Column(Date, nullable=False)
    source_filename = Column(String(500), nullable=False)
    title = Column(String(500))             # raw title from Excel row 1
    uploaded_by = Column(String(255))
    status = Column(String(50), default="PROCESSED")
    total_rows = Column(Integer)
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())


class MarketCapCategorizationRow(Base):
    __tablename__ = "market_cap_categorization_row"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    upload_id = Column(BigInteger, index=True)
    rank_number = Column(Integer, index=True)
    company_name = Column(String(500), nullable=False)
    isin = Column(String(50), index=True)
    bse_symbol = Column(String(50))
    bse_market_cap_cr = Column(Numeric(20, 4))
    nse_symbol = Column(String(50))
    nse_market_cap_cr = Column(Numeric(20, 4))
    msei_symbol = Column(String(50))
    msei_market_cap_cr = Column(Numeric(20, 4))
    avg_market_cap_cr = Column(Numeric(20, 4))   # Average of All Exchanges (Rs. Cr.)
    market_cap_bucket = Column(String(50), index=True)  # Large Cap / Mid Cap / Small Cap
    effective_date = Column(Date, index=True)
    created_at = Column(DateTime, server_default=func.now())
