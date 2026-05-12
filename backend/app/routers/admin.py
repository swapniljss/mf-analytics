from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models.observability import DataSourceFileLog, BackgroundJob, ReconciliationIssue, RejectedDataRow
from app.schemas.admin import FileLogOut, BackgroundJobOut, ReconciliationIssueOut
from app.schemas.common import MessageResponse
from datetime import datetime

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/file-logs", response_model=list[FileLogOut])
def list_file_logs(
    module_name: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(DataSourceFileLog)
    if module_name:
        q = q.filter_by(module_name=module_name)
    if status:
        q = q.filter_by(status=status)
    return q.order_by(DataSourceFileLog.created_at.desc()).limit(limit).all()


@router.get("/file-logs/{log_id}", response_model=FileLogOut)
def get_file_log(log_id: int, db: Session = Depends(get_db)):
    from fastapi import HTTPException
    log = db.get(DataSourceFileLog, log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    return log


@router.get("/rejected-rows")
def list_rejected_rows(
    module_name: Optional[str] = None,
    file_log_id: Optional[int] = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(RejectedDataRow)
    if module_name:
        q = q.filter_by(module_name=module_name)
    if file_log_id:
        q = q.filter_by(file_log_id=file_log_id)
    rows = q.order_by(RejectedDataRow.created_at.desc()).limit(limit).all()
    return [{"id": r.id, "module_name": r.module_name, "rejection_reason": r.rejection_reason, "created_at": str(r.created_at)} for r in rows]


@router.get("/jobs", response_model=list[BackgroundJobOut])
def list_jobs(
    status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(BackgroundJob)
    if status:
        q = q.filter_by(status=status)
    return q.order_by(BackgroundJob.created_at.desc()).limit(limit).all()


@router.get("/reconciliation", response_model=list[ReconciliationIssueOut])
def list_reconciliation_issues(
    status: Optional[str] = "OPEN",
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(ReconciliationIssue)
    if status:
        q = q.filter_by(status=status)
    return q.order_by(ReconciliationIssue.created_at.desc()).limit(limit).all()


@router.post("/reconciliation/{issue_id}/resolve", response_model=MessageResponse)
def resolve_reconciliation_issue(issue_id: int, db: Session = Depends(get_db)):
    from fastapi import HTTPException
    issue = db.get(ReconciliationIssue, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    issue.status = "RESOLVED"
    issue.resolved_at = datetime.utcnow()
    db.commit()
    return MessageResponse(message="Issue resolved")
