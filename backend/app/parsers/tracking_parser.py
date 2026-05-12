"""
Parse tracking error and tracking difference from AMFI API.
Tracking Error: https://www.amfiindia.com/api/tracking-error-data?MF_ID=all&strdt=01-apr-2026
Tracking Diff:  https://www.amfiindia.com/api/tracking-difference?MF_ID=all&date=01-Mar-2026
"""
from typing import List, Dict, Any
from datetime import date


def parse_tracking_error(data: list, as_of_date: date) -> List[Dict[str, Any]]:
    records = []
    for item in data:
        if not isinstance(item, dict):
            continue
        records.append({
            "amfi_code": str(item.get("SchemeCode", "")).strip() or None,
            "isin": item.get("ISIN"),
            "scheme_name": item.get("SchemeName", ""),
            "amc_name": item.get("MFName", item.get("AMCName", "")),
            "benchmark_name": item.get("BenchmarkName", item.get("Benchmark", "")),
            "tracking_error": _safe_float(item.get("TrackingError", item.get("TE"))),
            "period_type": item.get("Period", "1Y"),
            "as_of_date": as_of_date,
        })
    return records


def parse_tracking_difference(data: list, report_month: date) -> List[Dict[str, Any]]:
    records = []
    for item in data:
        if not isinstance(item, dict):
            continue
        records.append({
            "amfi_code": str(item.get("SchemeCode", "")).strip() or None,
            "isin": item.get("ISIN"),
            "scheme_name": item.get("SchemeName", ""),
            "amc_name": item.get("MFName", item.get("AMCName", "")),
            "benchmark_name": item.get("BenchmarkName", item.get("Benchmark", "")),
            "tracking_difference": _safe_float(item.get("TrackingDifference", item.get("TD"))),
            "report_month": report_month,
        })
    return records


def _safe_float(v) -> float | None:
    if v is None:
        return None
    try:
        return float(str(v).replace(",", ""))
    except (ValueError, TypeError):
        return None
