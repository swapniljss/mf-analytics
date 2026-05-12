from sqlalchemy import Column, BigInteger, String, Date, DateTime, Numeric, Integer, Text, func
from app.database import Base


class NavPrice(Base):
    __tablename__ = "nav_price"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    amfi_code = Column(String(50), nullable=False, index=True)
    isin_div_payout_growth = Column(String(50), index=True)
    isin_div_reinvestment = Column(String(50), index=True)
    scheme_name = Column(String(500), nullable=False)
    nav = Column(Numeric(18, 6), nullable=False)
    repurchase_price = Column(Numeric(18, 6))
    sale_price = Column(Numeric(18, 6))
    nav_date = Column(Date, nullable=False, index=True)
    source_type = Column(String(50))
    source_priority = Column(Integer, default=50)
    created_at = Column(DateTime, server_default=func.now())


class DailyNAV(Base):
    __tablename__ = "daily_nav"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    amfi_code = Column(String(50), nullable=False, index=True)
    isin_div_payout_growth = Column(String(50))
    isin_div_reinvestment = Column(String(50))
    scheme_name = Column(String(500), nullable=False)
    nav = Column(Numeric(18, 6), nullable=False)
    repurchase_price = Column(Numeric(18, 6))
    sale_price = Column(Numeric(18, 6))
    nav_date = Column(Date, nullable=False, index=True)
    fund_house = Column(String(255))
    raw_line = Column(Text)
    created_at = Column(DateTime, server_default=func.now())


class HistoricalNAVImportBatch(Base):
    __tablename__ = "historical_nav_import_batch"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    batch_name = Column(String(255), nullable=False)
    source_filename = Column(String(255), nullable=False)
    source_file_type = Column(String(50))
    uploaded_by = Column(String(255))
    status = Column(String(50), default="PROCESSED")
    total_rows = Column(Integer)
    inserted_rows = Column(Integer)
    updated_rows = Column(Integer)
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())


class HistoricalNAV(Base):
    __tablename__ = "historical_nav"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    import_batch_id = Column(BigInteger, index=True)
    source_row_number = Column(Integer)
    amfi_code = Column(String(50), nullable=False, index=True)
    isin_div_payout_growth = Column(String(50))
    isin_div_reinvestment = Column(String(50))
    scheme_name = Column(String(500), nullable=False)
    nav = Column(Numeric(18, 6), nullable=False)
    repurchase_price = Column(Numeric(18, 6))
    sale_price = Column(Numeric(18, 6))
    nav_date = Column(Date, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())
