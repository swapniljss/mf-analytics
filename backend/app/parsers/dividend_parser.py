"""
Parse Dividend / IDCW history CSV.

Expected columns (case-insensitive):
  amfi_code, isin, scheme_name, record_date (YYYY-MM-DD),
  ex_dividend_date, reinvestment_date, dividend_per_unit,
  face_value, nav_on_record_date, dividend_type
"""
import csv
import re
import logging
from datetime import date, datetime
from typing import Optional

logger = logging.getLogger(__name__)

COLUMN_ALIASES = {
    "amfi_code":           ["amfi_code", "scheme_code", "code"],
    "isin":                ["isin"],
    "scheme_name":         ["scheme_name", "scheme"],
    "record_date":         ["record_date", "ex_date", "date"],
    "ex_dividend_date":    ["ex_dividend_date", "ex_div_date"],
    "reinvestment_date":   ["reinvestment_date"],
    "dividend_per_unit":   ["dividend_per_unit", "dividend", "div_per_unit", "amount"],
    "face_value":          ["face_value", "fv"],
    "nav_on_record_date":  ["nav_on_record_date", "nav"],
    "dividend_type":       ["dividend_type", "type"],
}


def _norm(s): return re.sub(r"[^a-z0-9]", "_", str(s).lower().strip())

def _map(headers):
    normed = [_norm(h) for h in headers]
    out = {}
    for canonical, aliases in COLUMN_ALIASES.items():
        for i, n in enumerate(normed):
            if n in aliases and canonical not in out:
                out[canonical] = i
    return out

def _s(v):
    if v is None: return None
    s = str(v).strip()
    return s if s and s.lower() not in ("none", "nan", "-", "") else None

def _f(v):
    if v is None: return None
    try:
        import math; f = float(str(v).replace(",", ""))
        return None if math.isnan(f) else f
    except: return None

def _d(v):
    if v is None: return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d-%b-%Y", "%d %b %Y"):
        try: return datetime.strptime(str(v).strip(), fmt).date()
        except: pass
    return None


def parse_dividend_csv(file_path: str) -> list:
    with open(file_path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    if not rows:
        return []
    col_map = _map(rows[0])
    required = {"amfi_code", "record_date", "dividend_per_unit"}
    missing = required - col_map.keys()
    if missing:
        raise ValueError(f"Required columns missing: {missing}")

    records = []
    for row in rows[1:]:
        def get(k):
            idx = col_map.get(k)
            return row[idx] if idx is not None and idx < len(row) else None

        amfi_code = _s(get("amfi_code"))
        record_date = _d(get("record_date"))
        div = _f(get("dividend_per_unit"))
        if not amfi_code or not record_date or div is None:
            continue

        nav = _f(get("nav_on_record_date"))
        yield_val = round(div / nav * 100, 4) if nav and nav > 0 else None

        records.append({
            "amfi_code": amfi_code,
            "isin": _s(get("isin")),
            "scheme_name": _s(get("scheme_name")),
            "record_date": record_date,
            "ex_dividend_date": _d(get("ex_dividend_date")),
            "reinvestment_date": _d(get("reinvestment_date")),
            "dividend_per_unit": div,
            "face_value": _f(get("face_value")),
            "nav_on_record_date": nav,
            "dividend_yield": yield_val,
            "dividend_type": _s(get("dividend_type")) or "IDCW",
            "report_month": str(record_date)[:7],
        })
    return records
