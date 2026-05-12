from datetime import date, datetime, timedelta
import pytz

IST = pytz.timezone("Asia/Kolkata")


def get_ist_now() -> datetime:
    return datetime.now(IST)


def get_trading_date_for_nav() -> date:
    """Returns T-1 business day (skips weekends)."""
    today = get_ist_now().date()
    delta = 1
    candidate = today - timedelta(days=delta)
    while candidate.weekday() >= 5:  # Saturday=5, Sunday=6
        delta += 1
        candidate = today - timedelta(days=delta)
    return candidate


def derive_fy_label(fy_id: int) -> str:
    """Derive approximate FY label from fy_id (AMFI uses sequential IDs starting ~2001-02)."""
    base_year = 2000 + fy_id
    return f"FY{base_year}-{str(base_year + 1)[2:]}"


def derive_period_label(fy_id: int, period_id: int) -> str:
    base_year = 2000 + fy_id
    quarters = {
        1: f"Q1 Apr-Jun {base_year}",
        2: f"Q2 Jul-Sep {base_year}",
        3: f"Q3 Oct-Dec {base_year}",
        4: f"Q4 Jan-Mar {base_year + 1}",
    }
    return quarters.get(period_id, f"Period {period_id} FY{base_year}")


def first_of_month(year: int, month: int) -> date:
    return date(year, month, 1)


def parse_amfi_date(date_str: str) -> date:
    """Parse dates in AMFI format DD-MMM-YYYY or DD/MM/YYYY."""
    for fmt in ("%d-%b-%Y", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(date_str.strip(), fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date: {date_str}")
