export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface SchemeMaster {
  id: number
  amfi_code: string
  isin_div_payout_growth?: string
  isin_div_reinvestment?: string
  scheme_name: string
  amc_name?: string
  fund_house?: string
  scheme_category?: string
  scheme_type?: string
  plan_type?: string
  option_type?: string
  is_active?: string
  effective_from?: string
  created_at?: string
}

export interface NavPrice {
  id: number
  amfi_code: string
  scheme_name: string
  nav?: number
  nav_date?: string
  repurchase_price?: number
  sale_price?: number
  source_type?: string
}

export interface DailyNAV {
  id: number
  amfi_code: string
  scheme_name: string
  nav?: number
  nav_date?: string
  fund_house?: string
  isin_div_payout_growth?: string
  isin_div_reinvestment?: string
  created_at?: string
}

export interface AumScheme {
  id: number
  fy_id: number
  period_id: number
  fy_label?: string
  period_label?: string
  amfi_code?: string
  scheme_name: string
  amc_name?: string
  scheme_category?: string
  average_aum_cr?: number
  folio_count?: number
}

export interface AumFund {
  id: number
  fy_id: number
  period_id: number
  fy_label?: string
  period_label?: string
  amc_name: string
  total_aum_cr?: number
  equity_aum_cr?: number
  debt_aum_cr?: number
  hybrid_aum_cr?: number
  other_aum_cr?: number
  folio_count?: number
}

export interface SchemeSnapshot {
  id: number
  amfi_code: string
  scheme_name?: string
  amc_name?: string
  scheme_category?: string
  latest_nav?: number
  nav_date?: string
  return_1w?: number
  return_1m?: number
  return_3m?: number
  return_6m?: number
  return_1y?: number
  return_3y?: number
  return_5y?: number
  return_10y?: number
  since_inception?: number
  inception_date?: string
  aum_cr?: number
  expense_ratio?: number
  tracking_error_1y?: number
  tracking_diff_latest?: number
  nav_52w_high?: number
  nav_52w_low?: number
  sip_return_1y?: number
  sip_return_3y?: number
  sip_return_5y?: number
  sharpe_ratio?: number
  beta?: number
  std_deviation?: number
  snapshot_refreshed_at?: string
  max_drawdown?: number
  sortino_ratio?: number
  calmar_ratio?: number
  var_95?: number
  category_rank?: number
  category_count?: number
  category_quartile?: number
}

export interface NAVDataPoint {
  nav_date: string
  nav: number
}

export interface SchemeReturns {
  amfi_code: string
  scheme_name: string
  nav_history: NAVDataPoint[]
  return_1w?: number
  return_1m?: number
  return_3m?: number
  return_6m?: number
  return_1y?: number
  return_3y?: number
  return_5y?: number
}

export interface TopPerformer {
  amfi_code: string
  scheme_name: string
  amc_name?: string
  scheme_category?: string
  return_value?: number
  latest_nav?: number
  aum_cr?: number
}

export interface TrackingError {
  id: number
  amfi_code: string
  scheme_name: string
  amc_name?: string
  benchmark_name?: string
  tracking_error?: number
  period_type?: string
  as_of_date?: string
}

export interface TrackingDifference {
  id: number
  amfi_code: string
  scheme_name: string
  amc_name?: string
  benchmark_name?: string
  tracking_difference?: number
  report_month?: string
}

export interface DashboardSummary {
  total_active_schemes: number
  total_amcs: number
  latest_nav_date?: string
  total_industry_aum_cr?: number
}

export interface MarketCapRow {
  id: number
  company_name: string
  isin?: string
  sector_name?: string
  rank_number?: number
  market_cap_bucket?: string
  effective_date?: string
}

export interface FileLog {
  id: number
  module_name: string
  source_type?: string
  source_filename?: string
  status?: string
  row_count_total?: number
  row_count_inserted?: number
  row_count_rejected?: number
  error_message?: string
  created_at?: string
}

export interface BackgroundJob {
  id: number
  job_type: string
  status?: string
  error_message?: string
  started_at?: string
  completed_at?: string
  created_at?: string
}
