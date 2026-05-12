"""
Parse historical NAV from:
  https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt=01-Jan-2026
  https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt=01-Jan-2026&todt=07-Apr-2026

IMPORTANT: The historical report has a DIFFERENT column order from NAVAll.txt (daily feed).

Historical format header:
  Scheme Code;Scheme Name;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;
  Net Asset Value;Repurchase Price;Sale Price;Date

Field positions:
  [0] Scheme Code (AMFI code)
  [1] Scheme Name
  [2] ISIN Div Payout/Growth  (or empty)
  [3] ISIN Div Reinvestment   (or empty)
  [4] Net Asset Value
  [5] Repurchase Price        (or empty)
  [6] Sale Price              (or empty)
  [7] Date (DD-Mon-YYYY)

Example row:
  139619;Taurus Investor Education Pool - Unclaimed Dividend - Growth;;;10.0000;;;01-Apr-2026
"""
from typing import List, Dict, Any, Optional
from datetime import date
from app.utils.date_utils import parse_amfi_date


def parse_historical_nav(content: str) -> List[Dict[str, Any]]:
    """
    Parse AMFI historical NAV report (single date or date range).
    Each row contains its own date in parts[7], so multi-date range
    responses are handled correctly — every row gets its own date.
    """
    nav_records = []
    current_fund_house = None

    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue

        # Skip header row
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

        scheme_name   = parts[1]
        isin1         = parts[2] if parts[2] not in ("-", "") else None
        isin2         = parts[3] if parts[3] not in ("-", "") else None
        nav_str       = parts[4]

        try:
            nav_val = float(nav_str.replace(",", ""))
        except ValueError:
            continue

        # Repurchase / sale prices (may be empty)
        repurchase_price: Optional[float] = None
        sale_price: Optional[float] = None
        if len(parts) > 5 and parts[5]:
            try:
                repurchase_price = float(parts[5].replace(",", ""))
            except ValueError:
                pass
        if len(parts) > 6 and parts[6]:
            try:
                sale_price = float(parts[6].replace(",", ""))
            except ValueError:
                pass

        # Date is always at parts[7] in historical format
        nav_date: Optional[date] = None
        if len(parts) > 7 and parts[7]:
            try:
                nav_date = parse_amfi_date(parts[7])
            except ValueError:
                pass

        if nav_date is None:
            continue  # skip rows without a parseable date

        nav_records.append({
            "amfi_code":               amfi_code,
            "isin_div_payout_growth":  isin1,
            "isin_div_reinvestment":   isin2,
            "scheme_name":             scheme_name,
            "nav":                     nav_val,
            "repurchase_price":        repurchase_price,
            "sale_price":              sale_price,
            "nav_date":                nav_date,
            "fund_house":              current_fund_house,
            "raw_line":                line,
        })

    return nav_records
