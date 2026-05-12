"""
NPS / APY NAV file parser.

File format (no header, CSV):
  MM/DD/YYYY, PFM001, SBI PENSION FUNDS PRIVATE LIMITED, SM001003, SCHEME NAME, 56.7169

Handles:
  - Single .out file content (string)
  - ZIP bytes (extracts the .out file automatically)

Also classifies each scheme into asset_class / tier / variant / category.
"""

import io
import re
import csv
import zipfile
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)


# ── scheme classification ─────────────────────────────────────────────────────

def _classify_scheme(scheme_name: str) -> dict:
    """
    Derive asset_class, tier, variant, category, is_apy from the scheme name.
    Returns a dict with those 5 keys.
    """
    name = scheme_name.upper()

    # ── category ────────────────────────────────────────────────────────────
    if "ATAL PENSION YOJANA" in name or "(APY)" in name:
        category = "APY"
        is_apy = 1
    elif "APY FUND SCHEME" in name:
        category = "APY_FUND"
        is_apy = 1
    elif "CENTRAL GOVT" in name:
        category = "CENTRAL_GOVT"
        is_apy = 0
    elif "STATE GOVT" in name:
        category = "STATE_GOVT"
        is_apy = 0
    elif "NPS LITE" in name:
        category = "NPS_LITE"
        is_apy = 0
    elif "CORPORATE-CG" in name or "CORPORATE CG" in name:
        category = "CORPORATE_CG"
        is_apy = 0
    elif "UPS POOL" in name:
        category = "UPS_POOL"
        is_apy = 0
    elif " UPS " in name or name.endswith(" UPS"):
        category = "UPS"
        is_apy = 0
    elif "TAX SAVER" in name:
        category = "TAX_SAVER"
        is_apy = 0
    elif "COMPOSITE" in name:
        category = "COMPOSITE"
        is_apy = 0
    elif "VATSALYA" in name:
        category = "VATSALYA"
        is_apy = 0
    elif "AKSHAY DHARA" in name or "JEEVAN SWARNA" in name:
        category = "RETIREMENT_YOJANA"
        is_apy = 0
    elif "WEALTH BUILDER" in name or "DYNAMIC ASSET ALLOCATOR" in name or "LONG TERM EQUITY" in name:
        category = "NFO_SCHEME"
        is_apy = 0
    elif any(kw in name for kw in (
        "GROWTH PLUS", "SMART BALANCE", "KUBER", "INMFMF", "DREAM", "SWASTHYA",
        "SURAKSHIT", "EQUITY ADVANTAGE", "SECURE RETIREMENT", "SECURE FUTURE",
        "SMART RETIREMENT", "GOLDEN YEARS", "SWASTHYATOP",
    )):
        category = "NFO_SCHEME"
        is_apy = 0
    else:
        category = "NPS"
        is_apy = 0

    # ── asset_class ─────────────────────────────────────────────────────────
    # Match "SCHEME E", "SCHEME C", "SCHEME G", "SCHEME A"
    m = re.search(r"SCHEME\s+([ECGA])\s*[-–]", name)
    if not m:
        m = re.search(r"SCHEME\s+([ECGA])\s*$", name)
    if not m:
        m = re.search(r"\bSCHEME\s+([ECGA])\b", name)
    asset_class = m.group(1) if m else "NA"

    # ── tier ────────────────────────────────────────────────────────────────
    if re.search(r"TIER[-\s]?II\b", name):
        tier = "II"
    elif re.search(r"TIER[-\s]?I\b", name):
        tier = "I"
    else:
        tier = "NA"

    # ── variant ─────────────────────────────────────────────────────────────
    # "GS" at end of scheme name = Government Sector (not to be confused with Govt Securities)
    if name.rstrip().endswith(" DIRECT") or " DIRECT" in name:
        variant = "DIRECT"
    elif name.rstrip().endswith(" POP") or " POP" in name:
        variant = "POP"
    elif name.rstrip().endswith(" GS") or re.search(r"\bGS\b", name):
        variant = "GS"
    else:
        variant = "NA"

    return {
        "asset_class": asset_class,
        "tier":        tier,
        "variant":     variant,
        "category":    category,
        "is_apy":      is_apy,
    }


# ── file parsers ──────────────────────────────────────────────────────────────

def parse_nps_content(content: str) -> list[dict]:
    """
    Parse a NAV .out file (CSV, no header) and return a list of row dicts.

    Each dict has:
      nav_date, pfm_code, pfm_name, scheme_code, scheme_name, nav, classification
    """
    records = []
    reader = csv.reader(io.StringIO(content))
    for lineno, row in enumerate(reader, 1):
        if len(row) < 6:
            continue
        date_str, pfm_code, pfm_name, scheme_code, scheme_name, nav_str = (
            row[0].strip(), row[1].strip(), row[2].strip(),
            row[3].strip(), row[4].strip(), row[5].strip(),
        )
        try:
            nav_date = datetime.strptime(date_str, "%m/%d/%Y").date()
        except ValueError:
            logger.warning(f"Line {lineno}: bad date '{date_str}' — skipped")
            continue
        try:
            nav = float(nav_str)
            if nav <= 0:
                continue
        except ValueError:
            logger.warning(f"Line {lineno}: bad NAV '{nav_str}' — skipped")
            continue

        classification = _classify_scheme(scheme_name)
        records.append({
            "nav_date":    nav_date,
            "pfm_code":    pfm_code,
            "pfm_name":    pfm_name,
            "scheme_code": scheme_code,
            "scheme_name": scheme_name,
            "nav":         nav,
            **classification,
        })

    return records


def parse_nps_zip(zip_bytes: bytes) -> tuple[list[dict], str]:
    """
    Extract the .out file from a ZIP and parse it.
    Returns (records, filename).
    Raises ValueError if no .out file is found.
    """
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        out_files = [n for n in zf.namelist() if n.endswith(".out") and not n.startswith("__")]
        if not out_files:
            raise ValueError("ZIP contains no .out file")
        filename = out_files[0]
        content = zf.read(filename).decode("utf-8", errors="replace")

    logger.info(f"Parsed ZIP entry: {filename}")
    records = parse_nps_content(content)
    return records, filename
