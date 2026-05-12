from sqlalchemy import Column, BigInteger, String, Date, DateTime, Integer, Text, func
from app.database import Base


class DataSourceFileLog(Base):
    __tablename__ = "data_source_file_log"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    module_name = Column(String(100), nullable=False, index=True)
    source_type = Column(String(50))
    source_url = Column(String(1000))
    source_filename = Column(String(255))
    file_hash_sha256 = Column(String(128))
    file_size_bytes = Column(BigInteger)
    mime_type = Column(String(100))
    status = Column(String(50), default="RECEIVED", index=True)
    processing_started_at = Column(DateTime)
    processing_completed_at = Column(DateTime)
    row_count_total = Column(Integer)
    row_count_inserted = Column(Integer)
    row_count_updated = Column(Integer)
    row_count_rejected = Column(Integer)
    error_message = Column(Text)
    metadata_json = Column(Text)
    created_at = Column(DateTime, server_default=func.now())


class RejectedDataRow(Base):
    __tablename__ = "rejected_data_row"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    file_log_id = Column(BigInteger, index=True)
    module_name = Column(String(100))
    raw_json = Column(Text)
    rejection_reason = Column(Text)
    created_at = Column(DateTime, server_default=func.now())


class BackgroundJob(Base):
    __tablename__ = "background_job"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    job_type = Column(String(100), nullable=False, index=True)
    status = Column(String(50), default="PENDING", index=True)
    payload_json = Column(Text)
    result_json = Column(Text)
    error_message = Column(Text)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())


class ReconciliationIssue(Base):
    __tablename__ = "reconciliation_issue"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    issue_type = Column(String(100), nullable=False)
    entity_type = Column(String(100))
    entity_key = Column(String(255))
    severity = Column(String(50))
    status = Column(String(50), default="OPEN", index=True)
    details_json = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    resolved_at = Column(DateTime)
