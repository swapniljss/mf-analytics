from sqlalchemy import Column, BigInteger, String, Date, DateTime, Numeric, Integer, Text, func
from app.database import Base


class AverageAumScheme(Base):
    __tablename__ = "average_aum_scheme"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    fy_id = Column(Integer, nullable=False, index=True)
    period_id = Column(Integer, nullable=False, index=True)
    fy_label = Column(String(50))
    period_label = Column(String(100))
    amfi_code = Column(String(50), index=True)
    isin = Column(String(50))
    scheme_name = Column(String(500), nullable=False)
    amc_name = Column(String(255), index=True)
    scheme_category = Column(String(255), index=True)
    average_aum_cr = Column(Numeric(20, 6))
    fof_aum_cr = Column(Numeric(20, 6))           # Fund-of-Funds domestic AUM in crores
    aum_equity_cr = Column(Numeric(20, 6))
    aum_debt_cr = Column(Numeric(20, 6))
    aum_hybrid_cr = Column(Numeric(20, 6))
    aum_other_cr = Column(Numeric(20, 6))
    folio_count = Column(BigInteger)
    synced_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())


class AverageAumFund(Base):
    __tablename__ = "average_aum_fund"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    fy_id = Column(Integer, nullable=False, index=True)
    period_id = Column(Integer, nullable=False, index=True)
    fy_label = Column(String(50))
    period_label = Column(String(100))
    amc_name = Column(String(255), nullable=False, index=True)
    total_aum_cr = Column(Numeric(20, 6))
    fof_aum_cr = Column(Numeric(20, 6))           # Fund-of-Funds domestic AUM in crores
    equity_aum_cr = Column(Numeric(20, 6))
    debt_aum_cr = Column(Numeric(20, 6))
    hybrid_aum_cr = Column(Numeric(20, 6))
    other_aum_cr = Column(Numeric(20, 6))
    folio_count = Column(BigInteger)
    synced_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())


class AumSyncLog(Base):
    __tablename__ = "aum_sync_log"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    data_type = Column(String(50))
    fy_id = Column(Integer)
    period_id = Column(Integer)
    status = Column(String(50))
    records_fetched = Column(Integer)
    records_upserted = Column(Integer)
    message = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
