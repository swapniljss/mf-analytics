"""
Parse AUM API responses from AMFI.

Scheme-wise endpoint:
  https://www.amfiindia.com/api/average-aum-schemewise?strType=Categorywise&fyId=2&periodId=2&MF_ID=0

  Actual response structure:
  {
    "data": [
      {
        "strMFId": "0",
        "Mfname": "360 ONE Mutual Fund",
        "SchemeCat_Desc": "Hybrid Scheme - Balanced Hybrid Fund",
        "schemes": [
          {
            "SchemeNAVName": "360 ONE Balanced Hybrid Fund - Direct Plan - IDCW",
            "AMFI_Code": 152073,
            "AverageAumForTheMonth": {
              "ExcludingFundOfFundsDomesticButIncludingFundOfFundsOverseas": 18.61,
              "FundOfFundsDomestic": 0
            }
          }
        ]
      }
    ],
    "selectedPeriod": "October - December 2024"
  }

Fund-wise endpoint:
  https://www.amfiindia.com/api/average-aum-fundwise?fyId=2&periodId=2

  Actual response structure:
  {
    "fyId": "2", "periodId": "2",
    "selectedPeriod": "October - December 2024",
    "data": [
      {
        "Sr_No": "1",
        "MutualFundName": "360 ONE Mutual Fund",
        "averageAUM": {
          "average_aum_excluding_domestic_including_overseas": 1180518.98,
          "average_aum_fund_of_funds_domestic": 0
        }
      }
    ]
  }

NOTE: AUM values from the API are in LAKHS. Divide by 100 to get crores.
"""
from typing import List, Dict, Any, Optional
from app.utils.date_utils import derive_fy_label, derive_period_label


LAKHS_TO_CRORES = 100.0


def parse_aum_schemewise(
    data: list,
    fy_id: int,
    period_id: int,
    selected_period: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Parse scheme-wise AUM. `data` is the top-level "data" list from the API.
    Each element contains a "schemes" sub-list with per-scheme data.
    """
    records = []
    fy_label = derive_fy_label(fy_id)
    period_label = selected_period or derive_period_label(fy_id, period_id)

    for fund_group in data:
        if not isinstance(fund_group, dict):
            continue

        amc_name = fund_group.get("Mfname", "").strip()
        category_desc = fund_group.get("SchemeCat_Desc", "").strip()

        schemes = fund_group.get("schemes", [])
        if not isinstance(schemes, list):
            continue

        for scheme in schemes:
            if not isinstance(scheme, dict):
                continue

            amfi_code_raw = scheme.get("AMFI_Code")
            amfi_code = str(amfi_code_raw).strip() if amfi_code_raw is not None else None
            if not amfi_code or not amfi_code.isdigit():
                continue

            scheme_name = scheme.get("SchemeNAVName", "").strip()

            # AUM is in the nested dict; values are in lakhs → convert to crores
            aum_nested = scheme.get("AverageAumForTheMonth", {})
            aum_excl_fof_lakhs = _safe_float(
                aum_nested.get(
                    "ExcludingFundOfFundsDomesticButIncludingFundOfFundsOverseas"
                )
            )
            aum_fof_domestic_lakhs = _safe_float(
                aum_nested.get("FundOfFundsDomestic")
            )

            average_aum_cr = (
                aum_excl_fof_lakhs / LAKHS_TO_CRORES
                if aum_excl_fof_lakhs is not None
                else None
            )
            fof_aum_cr = (
                aum_fof_domestic_lakhs / LAKHS_TO_CRORES
                if aum_fof_domestic_lakhs is not None
                else None
            )

            records.append({
                "fy_id":           fy_id,
                "period_id":       period_id,
                "fy_label":        fy_label,
                "period_label":    period_label,
                "amfi_code":       amfi_code,
                "scheme_name":     scheme_name,
                "amc_name":        amc_name,
                "scheme_category": category_desc,
                "average_aum_cr":  average_aum_cr,
                "fof_aum_cr":      fof_aum_cr,
                # Keep legacy columns as None (not provided by this API)
                "isin":            None,
                "aum_equity_cr":   None,
                "aum_debt_cr":     None,
                "aum_hybrid_cr":   None,
                "aum_other_cr":    None,
                "folio_count":     None,
            })

    return records


def parse_aum_fundwise(
    data: list,
    fy_id: int,
    period_id: int,
    selected_period: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Parse fund-wise AUM. `data` is the top-level "data" list from the API.
    Each element is one AMC/fund row.
    """
    records = []
    fy_label = derive_fy_label(fy_id)
    period_label = selected_period or derive_period_label(fy_id, period_id)

    for item in data:
        if not isinstance(item, dict):
            continue

        amc_name = item.get("MutualFundName", "").strip()
        if not amc_name:
            continue

        aum_nested = item.get("averageAUM", {})
        total_excl_lakhs = _safe_float(
            aum_nested.get("average_aum_excluding_domestic_including_overseas")
        )
        fof_domestic_lakhs = _safe_float(
            aum_nested.get("average_aum_fund_of_funds_domestic")
        )

        total_aum_cr = (
            total_excl_lakhs / LAKHS_TO_CRORES
            if total_excl_lakhs is not None
            else None
        )
        fof_aum_cr = (
            fof_domestic_lakhs / LAKHS_TO_CRORES
            if fof_domestic_lakhs is not None
            else None
        )

        records.append({
            "fy_id":         fy_id,
            "period_id":     period_id,
            "fy_label":      fy_label,
            "period_label":  period_label,
            "amc_name":      amc_name,
            "total_aum_cr":  total_aum_cr,
            "fof_aum_cr":    fof_aum_cr,
            # Legacy columns — not available in this API
            "equity_aum_cr": None,
            "debt_aum_cr":   None,
            "hybrid_aum_cr": None,
            "other_aum_cr":  None,
            "folio_count":   None,
        })

    return records


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_float(v) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(str(v).replace(",", ""))
    except (ValueError, TypeError):
        return None


def _safe_int(v) -> Optional[int]:
    if v is None:
        return None
    try:
        return int(str(v).replace(",", ""))
    except (ValueError, TypeError):
        return None
