from sqlalchemy import Column, BigInteger, String, Date, DateTime, Numeric, func
from app.database import Base


class DividendHistory(Base):
    __tablename__ = "dividend_history"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    amfi_code = Column(String(50), nullable=False, index=True)
    isin = Column(String(50), index=True)
    scheme_name = Column(String(500))
    record_date = Column(Date, nullable=False, index=True)
    ex_dividend_date = Column(Date)
    reinvestment_date = Column(Date)
    dividend_per_unit = Column(Numeric(18, 6))
    face_value = Column(Numeric(18, 4))
    nav_on_record_date = Column(Numeric(18, 6))
    dividend_yield = Column(Numeric(10, 6))   # dividend_per_unit / nav * 100
    dividend_type = Column(String(50))        # IDCW / Bonus / Special
    report_month = Column(String(7), index=True)  # YYYY-MM
    created_at = Column(DateTime, server_default=func.now())
