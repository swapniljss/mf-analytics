"""
Parse AMFI Scheme Master CSV from:
https://portal.amfiindia.com/DownloadSchemeData_Po.aspx?mf=0

Actual format (comma-separated, Windows CRLF):
AMC,Code,Scheme Name,Scheme Type,Scheme Category,Scheme NAV Name,
Scheme Minimum Amount,Launch Date,Closure Date,ISIN Div Payout/ISIN Growth[ISIN Div Reinvestment]

Key detail: The last column concatenates up to 2 ISINs of 12 chars each with NO separator.
  - Empty       → no ISIN
  - 12 chars    → one ISIN (isin_div_payout_growth only)
  - 24 chars    → two ISINs (first 12 = payout/growth, last 12 = reinvestment)
"""
import csv
import io
import re
from typing import List, Dict, Any


ISIN_LEN = 12


def split_isin_field(raw: str):
    """Split concatenated ISIN field into (isin1, isin2)."""
    raw = raw.strip()
    if not raw:
        return None, None
    if len(raw) >= ISIN_LEN * 2:
        return raw[:ISIN_LEN], raw[ISIN_LEN:ISIN_LEN * 2]
    if len(raw) >= ISIN_LEN:
        return raw[:ISIN_LEN], None
    return raw, None          # malformed but keep it


def normalize_scheme_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.lower().strip())


def detect_plan_type(name: str) -> str:
    lower = name.lower()
    if "direct" in lower:
        return "Direct"
    if "regular" in lower:
        return "Regular"
    return "Unknown"


def detect_option_type(name: str) -> str:
    lower = name.lower()
    if "growth" in lower:
        return "Growth"
    if "idcw" in lower or "dividend" in lower:
        return "IDCW"
    return "Unknown"


def parse_scheme_master_text(content: str) -> List[Dict[str, Any]]:
    """
    Parse the AMFI Scheme Master CSV content and return a list of scheme dicts.
    Skips the header row automatically.
    """
    schemes = []

    # Normalise line endings
    content = content.replace("\r\n", "\n").replace("\r", "\n")

    reader = csv.reader(io.StringIO(content))

    for i, row in enumerate(reader):
        # Skip header row
        if i == 0:
            continue

        # Skip completely empty rows
        if not any(cell.strip() for cell in row):
            continue

        # Need at least 6 columns (AMC, Code, Scheme Name, Type, Category, NAV Name)
        if len(row) < 6:
            continue

        amc_name    = row[0].strip()
        amfi_code   = row[1].strip()
        fund_name   = row[2].strip()          # Fund / group name
        scheme_type = row[3].strip()          # Open Ended / Close Ended / Interval
        scheme_cat  = row[4].strip()          # e.g. Equity Scheme - Large Cap Fund
        scheme_name = row[5].strip()          # Actual scheme NAV name (with plan/option)
        # row[6] = min amount, row[7] = launch date, row[8] = closure date
        isin_raw    = row[9].strip() if len(row) > 9 else ""

        # Skip rows where amfi_code is not numeric
        if not amfi_code.isdigit():
            continue

        isin1, isin2 = split_isin_field(isin_raw)

        schemes.append({
            "amfi_code":               amfi_code,
            "isin_div_payout_growth":  isin1,
            "isin_div_reinvestment":   isin2,
            "scheme_name":             scheme_name or fund_name,
            "normalized_scheme_name":  normalize_scheme_name(scheme_name or fund_name),
            "amc_name":                amc_name,
            "fund_house":              amc_name,
            "category_header":         scheme_type,       # Open Ended / Close Ended
            "scheme_category":         scheme_cat,
            "scheme_type":             scheme_type,
            "plan_type":               detect_plan_type(scheme_name),
            "option_type":             detect_option_type(scheme_name),
            "is_active":               "Y",
            "raw_line":                ",".join(row),
        })

    return schemes
