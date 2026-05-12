"""
Parse daily NAV from https://portal.amfiindia.com/spages/NAVAll.txt

Actual format (semicolon-separated):
  Header: Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date
  Row:    119551;INF209KA12Z1;INF209KA13Z9;Aditya Birla Sun Life...- DIRECT - IDCW;103.9918;07-Apr-2026

Field positions:
  [0] Scheme Code (AMFI code)
  [1] ISIN Div Payout/Growth  (or "-")
  [2] ISIN Div Reinvestment   (or "-")
  [3] Scheme Name
  [4] Net Asset Value
  [5] Date (DD-Mon-YYYY)

NOTE: The historical NAV report has a DIFFERENT column order — see historical_nav_parser.py.
"""
from typing import List, Dict, Any, Optional
from datetime import date
from app.utils.date_utils import parse_amfi_date


def parse_nav_all(content: str, nav_date: Optional[date] = None) -> List[Dict[str, Any]]:
    """
    Parse NAVAll.txt (daily feed) format.
    nav_date is used as a fallback if the date cannot be parsed from a row.
    Each row's date is parsed independently so the result is always accurate.
    """
    nav_records = []
    current_fund_house = None

    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue

        # Skip the header row
        if line.lower().startswith("scheme code"):
            continue

        # Fund house / category separator lines have no semicolons
        if ";" not in line:
            current_fund_house = line
            continue

        parts = [p.strip() for p in line.split(";")]
        if len(parts) < 5:
            continue

        amfi_code = parts[0]
        if not amfi_code.isdigit():
            continue

        isin1 = parts[1] if parts[1] not in ("-", "") else None
        isin2 = parts[2] if parts[2] not in ("-", "") else None
        scheme_name = parts[3]
        nav_str = parts[4]

        try:
            nav_val = float(nav_str.replace(",", ""))
        except ValueError:
            continue

        # Parse date from this row; fall back to the provided nav_date
        row_date: Optional[date] = None
        if len(parts) > 5 and parts[5]:
            try:
                row_date = parse_amfi_date(parts[5])
            except ValueError:
                pass
        record_date = row_date or nav_date

        if record_date is None:
            continue  # skip rows with no usable date

        nav_records.append({
            "amfi_code":               amfi_code,
            "isin_div_payout_growth":  isin1,
            "isin_div_reinvestment":   isin2,
            "scheme_name":             scheme_name,
            "nav":                     nav_val,
            "repurchase_price":        None,
            "sale_price":              None,
            "nav_date":                record_date,
            "fund_house":              current_fund_house,
            "raw_line":                line,
        })

    return nav_records
