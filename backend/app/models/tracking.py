from sqlalchemy import Column, BigInteger, String, Date, DateTime, Numeric, Text, func
from app.database import Base


class TrackingError(Base):
    __tablename__ = "tracking_error"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    amfi_code = Column(String(50), nullable=False, index=True)
    isin = Column(String(50))
    scheme_name = Column(String(500), nullable=False)
    amc_name = Column(String(255), index=True)
    benchmark_name = Column(String(500))
    tracking_error = Column(Numeric(10, 6))
    period_type = Column(String(50))
    as_of_date = Column(Date, nullable=False, index=True)
    synced_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())


class TrackingDifference(Base):
    __tablename__ = "tracking_difference"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    amfi_code = Column(String(50), nullable=False, index=True)
    isin = Column(String(50))
    scheme_name = Column(String(500), nullable=False)
    amc_name = Column(String(255), index=True)
    benchmark_name = Column(String(500))
    tracking_difference = Column(Numeric(10, 6))
    report_month = Column(Date, nullable=False, index=True)
    synced_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())


class TrackingSyncLog(Base):
    __tablename__ = "tracking_sync_log"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    data_type = Column(String(50))
    status = Column(String(50))
    records_fetched = Column(BigInteger)
    records_upserted = Column(BigInteger)
    message = Column(Text)
    as_of_date = Column(Date)
    created_at = Column(DateTime, server_default=func.now())
