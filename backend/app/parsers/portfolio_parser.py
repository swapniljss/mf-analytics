"""
Parse portfolio holding CSV/Excel files.

Expected columns (case-insensitive, order flexible):
  amfi_code, company_name, company_isin, sector, quantity,
  market_value_cr, percentage_exposure, security_class,
  rating, rating_agency, avg_maturity_years, modified_duration

report_month is passed in as a parameter (not read from file).
"""
import logging
import re
from typing import Optional
import openpyxl
import csv

logger = logging.getLogger(__name__)

COLUMN_ALIASES = {
    "amfi_code":            ["amfi_code", "scheme_code", "amficode", "code"],
    "scheme_name":          ["scheme_name", "schemename", "scheme"],
    "company_name":         ["company_name", "company", "security_name", "name", "instrument"],
    "company_isin":         ["company_isin", "isin", "security_isin"],
    "sector":               ["sector", "industry", "sector_name"],
    "quantity":             ["quantity", "units", "volume", "qty"],
    "market_value_cr":      ["market_value_cr", "market_value", "value_cr", "value_crores", "mktval"],
    "percentage_exposure":  ["percentage_exposure", "percentage", "exposure", "weight", "wt", "pct"],
    "security_class":       ["security_class", "asset_class", "type", "security_type", "instrument_type"],
    "rating":               ["rating", "credit_rating"],
    "rating_agency":        ["rating_agency", "agency"],
    "avg_maturity_years":   ["avg_maturity_years", "avg_maturity", "maturity"],
    "modified_duration":    ["modified_duration", "duration"],
}


def _normalize_col(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "_", str(name).strip().lower())


def _map_columns(headers: list) -> dict:
    """Return {canonical_name: col_index}."""
    normalized = [_normalize_col(h) for h in headers]
    mapping = {}
    for canonical, aliases in COLUMN_ALIASES.items():
        for i, n in enumerate(normalized):
            if n in aliases and canonical not in mapping:
                mapping[canonical] = i
                break
    return mapping


def _f(v) -> Optional[float]:
    if v is None:
        return None
    try:
        f = float(str(v).replace(",", "").strip())
        import math
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None


def _s(v) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s if s and s.lower() not in ("none", "nan", "-", "") else None


def parse_portfolio_file(file_path: str, report_month: str) -> dict:
    """
    Parse CSV or XLSX portfolio holdings file.
    Returns {"records": [...], "report_month": str}
    """
    if file_path.lower().endswith(".csv"):
        rows = _read_csv(file_path)
    else:
        rows = _read_xlsx(file_path)

    if not rows:
        return {"report_month": report_month, "records": []}

    headers = rows[0]
    col_map = _map_columns(headers)

    required = {"amfi_code", "company_name"}
    missing = required - col_map.keys()
    if missing:
        raise ValueError(f"Required columns missing: {missing}. Found: {list(headers)}")

    records = []
    for row in rows[1:]:
        if not row or not any(row):
            continue

        def get(key):
            idx = col_map.get(key)
            return row[idx] if idx is not None and idx < len(row) else None

        amfi_code = _s(get("amfi_code"))
        company_name = _s(get("company_name"))
        if not amfi_code or not company_name:
            continue

        records.append({
            "amfi_code":            amfi_code,
            "scheme_name":          _s(get("scheme_name")),
            "company_name":         company_name,
            "company_isin":         _s(get("company_isin")),
            "sector":               _s(get("sector")),
            "quantity":             _f(get("quantity")),
            "market_value_cr":      _f(get("market_value_cr")),
            "percentage_exposure":  _f(get("percentage_exposure")),
            "security_class":       _s(get("security_class")),
            "rating":               _s(get("rating")),
            "rating_agency":        _s(get("rating_agency")),
            "avg_maturity_years":   _f(get("avg_maturity_years")),
            "modified_duration":    _f(get("modified_duration")),
            "report_month":         report_month,
        })

    logger.info(f"Parsed {len(records)} portfolio holdings for {report_month}")
    return {"report_month": report_month, "records": records}


def _read_csv(path: str) -> list:
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        return [row for row in reader if row]


def _read_xlsx(path: str) -> list:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    result = [list(r) for r in ws.iter_rows(values_only=True)]
    wb.close()
    return result
