import logging
import json
from datetime import date
from sqlalchemy.orm import Session
from app.models.disclosure import (
    MonthlyDisclosureUpload, MonthlyDisclosureRow,
    SubClassificationUpload, SubClassificationRow,
    QuarterlyDisclosureUpload, QuarterlyDisclosureRow,
)
from app.utils.pandas_utils import read_excel_first_sheet, df_to_records, safe_numeric

logger = logging.getLogger(__name__)


def process_monthly_disclosure(db: Session, file_path: str, report_month: date) -> dict:
    df = read_excel_first_sheet(file_path)
    records = df_to_records(df)

    upload = MonthlyDisclosureUpload(
        report_month=report_month,
        source_filename=file_path,
        status="PROCESSING",
        total_rows=len(records),
    )
    db.add(upload)
    db.flush()

    inserted = 0
    for r in records:
        scheme_name = str(r.get("scheme_name", r.get("schemename", r.get("name", "")))).strip()
        if not scheme_name:
            continue

        row = MonthlyDisclosureRow(
            upload_id=upload.id,
            scheme_name=scheme_name,
            amfi_code=str(r.get("scheme_code", r.get("amfi_code", ""))).strip() or None,
            isin=str(r.get("isin", "")).strip() or None,
            amc_name=str(r.get("amc", r.get("amc_name", r.get("mutual_fund", "")))).strip() or None,
            scheme_category=str(r.get("category", r.get("scheme_category", ""))).strip() or None,
            report_month=report_month,
            aum_cr=safe_numeric(r.get("average_aum", r.get("net_assets", r.get("aum")))),
            expense_ratio=safe_numeric(r.get("expense_ratio", r.get("total_expense_ratio"))),
            portfolio_turnover=safe_numeric(r.get("portfolio_turnover")),
            fund_manager=str(r.get("fund_manager", "")).strip() or None,
            benchmark_name=str(r.get("benchmark", r.get("benchmark_name", ""))).strip() or None,
            exit_load=str(r.get("exit_load", "")).strip() or None,
            raw_json=json.dumps(r, default=str),
        )
        db.add(row)
        inserted += 1

    upload.status = "PROCESSED"
    db.commit()
    return {"upload_id": upload.id, "inserted": inserted}


def process_sub_classification(db: Session, file_path: str, report_month: date) -> dict:
    df = read_excel_first_sheet(file_path)
    records = df_to_records(df)

    upload = SubClassificationUpload(
        report_month=report_month,
        source_filename=file_path,
        status="PROCESSING",
        total_rows=len(records),
    )
    db.add(upload)
    db.flush()

    inserted = 0
    for r in records:
        scheme_name = str(r.get("scheme_name", r.get("schemename", r.get("name", "")))).strip()
        if not scheme_name:
            continue

        row = SubClassificationRow(
            upload_id=upload.id,
            scheme_name=scheme_name,
            amfi_code=str(r.get("scheme_code", r.get("amfi_code", ""))).strip() or None,
            isin=str(r.get("isin", "")).strip() or None,
            amc_name=str(r.get("amc", r.get("amc_name", ""))).strip() or None,
            scheme_category=str(r.get("category", r.get("scheme_category", ""))).strip() or None,
            scheme_sub_category=str(r.get("sub_category", r.get("scheme_sub_category", ""))).strip() or None,
            sub_classification=str(r.get("sub_classification", "")).strip() or None,
            report_month=report_month,
            raw_json=json.dumps(r, default=str),
        )
        db.add(row)
        inserted += 1

    upload.status = "PROCESSED"
    db.commit()
    return {"upload_id": upload.id, "inserted": inserted}


def process_quarterly_disclosure(db: Session, file_path: str, report_quarter: date) -> dict:
    df = read_excel_first_sheet(file_path)
    records = df_to_records(df)

    upload = QuarterlyDisclosureUpload(
        report_quarter=report_quarter,
        source_filename=file_path,
        status="PROCESSING",
        total_rows=len(records),
    )
    db.add(upload)
    db.flush()

    inserted = 0
    for r in records:
        scheme_name = str(r.get("scheme_name", r.get("schemename", r.get("name", "")))).strip()
        if not scheme_name:
            continue

        row = QuarterlyDisclosureRow(
            upload_id=upload.id,
            scheme_name=scheme_name,
            amfi_code=str(r.get("scheme_code", r.get("amfi_code", ""))).strip() or None,
            isin=str(r.get("isin", "")).strip() or None,
            amc_name=str(r.get("amc", r.get("amc_name", ""))).strip() or None,
            scheme_category=str(r.get("category", r.get("scheme_category", ""))).strip() or None,
            report_quarter=report_quarter,
            std_deviation=safe_numeric(r.get("std_deviation", r.get("standard_deviation"))),
            beta=safe_numeric(r.get("beta")),
            sharpe_ratio=safe_numeric(r.get("sharpe_ratio", r.get("sharpe"))),
            portfolio_turnover=safe_numeric(r.get("portfolio_turnover")),
            raw_json=json.dumps(r, default=str),
        )
        db.add(row)
        inserted += 1

    upload.status = "PROCESSED"
    db.commit()
    return {"upload_id": upload.id, "inserted": inserted}
