from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class FileLogOut(BaseModel):
    id: int
    module_name: str
    source_type: Optional[str] = None
    source_url: Optional[str] = None
    source_filename: Optional[str] = None
    file_hash_sha256: Optional[str] = None
    file_size_bytes: Optional[int] = None
    status: Optional[str] = None
    processing_started_at: Optional[datetime] = None
    processing_completed_at: Optional[datetime] = None
    row_count_total: Optional[int] = None
    row_count_inserted: Optional[int] = None
    row_count_updated: Optional[int] = None
    row_count_rejected: Optional[int] = None
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BackgroundJobOut(BaseModel):
    id: int
    job_type: str
    status: Optional[str] = None
    result_json: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ReconciliationIssueOut(BaseModel):
    id: int
    issue_type: str
    entity_type: Optional[str] = None
    entity_key: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    details_json: Optional[str] = None
    created_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True
