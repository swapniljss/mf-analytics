from sqlalchemy import Column, BigInteger, String, Date, DateTime, Numeric, Integer, Text, func
from app.database import Base


class SubClassificationUpload(Base):
    __tablename__ = "sub_classification_upload"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    report_month = Column(Date, nullable=False)
    source_filename = Column(String(255), nullable=False)
    uploaded_by = Column(String(255))
    status = Column(String(50), default="PROCESSED")
    total_rows = Column(Integer)
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())


class SubClassificationRow(Base):
    __tablename__ = "sub_classification_row"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    upload_id = Column(BigInteger, index=True)
    amfi_code = Column(String(50), index=True)
    isin = Column(String(50))
    scheme_name = Column(String(500), nullable=False)
    amc_name = Column(String(255), index=True)
    scheme_category = Column(String(255), index=True)
    scheme_sub_category = Column(String(255))
    sub_classification = Column(String(255))
    report_month = Column(Date, index=True)
    raw_json = Column(Text)
    created_at = Column(DateTime, server_default=func.now())


class MonthlyDisclosureUpload(Base):
    __tablename__ = "monthly_disclosure_upload"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    report_month = Column(Date, nullable=False)
    source_filename = Column(String(255), nullable=False)
    uploaded_by = Column(String(255))
    status = Column(String(50), default="PROCESSED")
    total_rows = Column(Integer)
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())


class MonthlyDisclosureRow(Base):
    __tablename__ = "monthly_disclosure_row"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    upload_id = Column(BigInteger, index=True)
    amfi_code = Column(String(50), index=True)
    isin = Column(String(50))
    scheme_name = Column(String(500))
    amc_name = Column(String(255), index=True)
    scheme_category = Column(String(255))
    report_month = Column(Date, index=True)
    aum_cr = Column(Numeric(20, 6))
    expense_ratio = Column(Numeric(8, 4))
    portfolio_turnover = Column(Numeric(8, 4))
    fund_manager = Column(String(500))
    benchmark_name = Column(String(500))
    inception_date = Column(Date)
    exit_load = Column(Text)
    raw_json = Column(Text)
    created_at = Column(DateTime, server_default=func.now())


class QuarterlyDisclosureUpload(Base):
    __tablename__ = "quarterly_disclosure_upload"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    report_quarter = Column(Date, nullable=False)
    source_filename = Column(String(255), nullable=False)
    uploaded_by = Column(String(255))
    status = Column(String(50), default="PROCESSED")
    total_rows = Column(Integer)
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())


class QuarterlyDisclosureRow(Base):
    __tablename__ = "quarterly_disclosure_row"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    upload_id = Column(BigInteger, index=True)
    amfi_code = Column(String(50), index=True)
    isin = Column(String(50))
    scheme_name = Column(String(500))
    amc_name = Column(String(255), index=True)
    scheme_category = Column(String(255))
    report_quarter = Column(Date, index=True)
    std_deviation = Column(Numeric(10, 6))
    beta = Column(Numeric(10, 6))
    sharpe_ratio = Column(Numeric(10, 6))
    portfolio_turnover = Column(Numeric(10, 6))
    raw_json = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
