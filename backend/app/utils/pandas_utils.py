import pandas as pd
import numpy as np
from typing import List, Dict, Any


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = [
        str(c).strip().lower().replace(" ", "_").replace("-", "_").replace("(", "").replace(")", "")
        for c in df.columns
    ]
    return df


def drop_empty_rows(df: pd.DataFrame) -> pd.DataFrame:
    return df.dropna(how="all").reset_index(drop=True)


def safe_numeric(value) -> float | None:
    if pd.isna(value):
        return None
    try:
        cleaned = str(value).replace(",", "").strip()
        if cleaned in ("-", "N.A.", "NA", ""):
            return None
        return float(cleaned)
    except (ValueError, TypeError):
        return None


def df_to_records(df: pd.DataFrame) -> List[Dict[str, Any]]:
    records = []
    for _, row in df.iterrows():
        clean = {}
        for k, v in row.items():
            if pd.isna(v) if not isinstance(v, (list, dict)) else False:
                clean[k] = None
            elif isinstance(v, float) and np.isnan(v):
                clean[k] = None
            else:
                clean[k] = v
        records.append(clean)
    return records


def read_excel_all_sheets(file_path: str) -> Dict[str, pd.DataFrame]:
    return pd.read_excel(file_path, sheet_name=None, engine="openpyxl")


def read_excel_first_sheet(file_path: str, header_row: int = 0) -> pd.DataFrame:
    df = pd.read_excel(file_path, header=header_row, engine="openpyxl")
    df = drop_empty_rows(df)
    df = normalize_columns(df)
    return df
