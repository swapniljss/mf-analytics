"""
Parse AMFI Market Cap Categorization Excel file.

File: AverageMarketCapitalizationDDMmmYYYY.xlsx
Source: https://www.amfiindia.com/research-information/other-data/categorization-of-stocks

Actual structure (confirmed from AverageMarketCapitalization30Jun2025.xlsx):

  Row 1  : Title — "Average Market Capitalization of listed companies during
                      the six months ended 30 June 2025"
  Row 2  : Headers — 11 columns (see below)
  Rows 3+: Data rows — ~5158 companies

Column layout (0-indexed):
  [0]  Sr. No.
  [1]  Company name
  [2]  ISIN
  [3]  BSE Symbol
  [4]  BSE 6 month Avg Total Market Cap in (Rs. Crs.)
  [5]  NSE Symbol
  [6]  NSE 6 month Avg Total Market Cap (Rs. Crs.)
  [7]  MSEI Symbol
  [8]  MSEI 6 month Avg Total Market Cap in (Rs Crs.)
  [9]  Average of All Exchanges (Rs. Cr.)
  [10] Categorization as per SEBI Circular dated Oct 6, 2017
       → "Large Cap" / "Mid Cap" / "Small Cap"

The effective date is extracted from the title row (row 1).
"""
import re
import logging
from datetime import date
from typing import Optional
import openpyxl

logger = logging.getLogger(__name__)

# Month name → month number (full names and 3-letter abbreviations)
_MONTH_MAP = {
    "january": 1, "jan": 1,
    "february": 2, "feb": 2,
    "march": 3, "mar": 3,
    "april": 4, "apr": 4,
    "may": 5,
    "june": 6, "jun": 6,
    "july": 7, "jul": 7,
    "august": 8, "aug": 8,
    "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10,
    "november": 11, "nov": 11,
    "december": 12, "dec": 12,
}


def _parse_date_from_title(title: str) -> Optional[date]:
    """
    Extract the effective date from the title row.

    Handles all observed AMFI title formats:
      "... six months ended 30 June 2025"     → space-separated, full month name
      "... six months  ended 31-Dec 2017"     → hyphen between day and 3-letter abbrev
      "... six months ended 31 December 2024" → space, full month name
    """
    if not title:
        return None

    title = str(title)

    # Pattern 1: DD-Mon YYYY  e.g. "31-Dec 2017"
    m = re.search(r"(\d{1,2})-([A-Za-z]{3,})\s+(\d{4})", title)
    if not m:
        # Pattern 2: DD Mon(th) YYYY  e.g. "30 June 2025"
        m = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", title)

    if m:
        day   = int(m.group(1))
        month = _MONTH_MAP.get(m.group(2).lower())
        year  = int(m.group(3))
        if month:
            try:
                return date(year, month, day)
            except ValueError:
                pass
    return None


def parse_market_cap_excel(file_path: str) -> dict:
    """
    Parse the AMFI Market Cap Categorization Excel file.

    Returns:
        {
            "effective_date": date | None,    # parsed from title row
            "title": str,                     # raw title string
            "records": [                      # list of company dicts
                {
                    "rank_number": int,
                    "company_name": str,
                    "isin": str | None,
                    "bse_symbol": str | None,
                    "bse_market_cap_cr": float | None,
                    "nse_symbol": str | None,
                    "nse_market_cap_cr": float | None,
                    "msei_symbol": str | None,
                    "msei_market_cap_cr": float | None,
                    "avg_market_cap_cr": float | None,
                    "market_cap_bucket": str | None,  # "Large Cap" / "Mid Cap" / "Small Cap"
                }
            ]
        }
    """
    wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    if not rows:
        return {"effective_date": None, "title": "", "records": []}

    # Row 0: title
    title_row = rows[0]
    title = str(title_row[0]).strip() if title_row and title_row[0] else ""
    effective_date = _parse_date_from_title(title)
    if effective_date:
        logger.info(f"Parsed effective date from title: {effective_date}")
    else:
        logger.warning(f"Could not parse effective date from title: '{title}'")

    # Row 1: headers (skip)
    # Rows 2+: data
    records = []
    for row in rows[2:]:
        if not row or not row[0]:
            continue

        # Sr. No. must be numeric
        try:
            rank = int(row[0])
        except (TypeError, ValueError):
            continue

        company_name = str(row[1]).strip() if row[1] else ""
        if not company_name or company_name.lower() in ("none", "nan", ""):
            continue

        isin         = _str_or_none(row[2])
        bse_symbol   = _str_or_none(row[3])
        bse_cap      = _float_or_none(row[4])
        nse_symbol   = _str_or_none(row[5])
        nse_cap      = _float_or_none(row[6])
        msei_symbol  = _str_or_none(row[7])
        msei_cap     = _float_or_none(row[8])
        avg_cap      = _float_or_none(row[9])
        bucket       = _str_or_none(row[10])

        # Validate bucket; fall back to rank-based derivation
        if bucket not in ("Large Cap", "Mid Cap", "Small Cap"):
            if rank <= 100:
                bucket = "Large Cap"
            elif rank <= 250:
                bucket = "Mid Cap"
            else:
                bucket = "Small Cap"

        records.append({
            "rank_number":       rank,
            "company_name":      company_name,
            "isin":              isin,
            "bse_symbol":        bse_symbol,
            "bse_market_cap_cr": bse_cap,
            "nse_symbol":        nse_symbol,
            "nse_market_cap_cr": nse_cap,
            "msei_symbol":       msei_symbol,
            "msei_market_cap_cr": msei_cap,
            "avg_market_cap_cr": avg_cap,
            "market_cap_bucket": bucket,
        })

    logger.info(f"Parsed {len(records)} companies from '{title}'")
    return {"effective_date": effective_date, "title": title, "records": records}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _str_or_none(v) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s if s and s.lower() not in ("none", "nan", "-", "") else None


def _float_or_none(v) -> Optional[float]:
    if v is None:
        return None
    try:
        f = float(v)
        import math
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None
