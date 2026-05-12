import apiClient from './client'
import { DashboardSummary, PaginatedResponse, SchemeReturns, SchemeSnapshot, TopPerformer } from '../types'

export const fetchDashboardSummary = async (): Promise<DashboardSummary> => {
  const { data } = await apiClient.get<DashboardSummary>('/analytics/summary')
  return data
}

export const fetchSnapshots = async (params: {
  search?: string
  amc_name?: string
  category?: string
  page?: number
  page_size?: number
}) => {
  const { data } = await apiClient.get<PaginatedResponse<SchemeSnapshot>>('/analytics/snapshots', { params })
  return data
}

export const fetchSchemeSnapshot = async (amfiCode: string): Promise<SchemeSnapshot | null> => {
  try {
    const { data } = await apiClient.get<SchemeSnapshot | null>(`/analytics/scheme/${amfiCode}/snapshot`)
    return data
  } catch {
    return null
  }
}

export const fetchSchemeReturns = async (amfiCode: string, fromDate?: string, toDate?: string): Promise<SchemeReturns> => {
  try {
    const { data } = await apiClient.get<SchemeReturns>(`/analytics/scheme/${amfiCode}/returns`, {
      params: { from_date: fromDate, to_date: toDate },
    })
    return data
  } catch {
    return { amfi_code: amfiCode, scheme_name: '', nav_history: [] }
  }
}

export const fetchTopPerformers = async (params: {
  category?: string
  period?: string
  limit?: number
}) => {
  const { data } = await apiClient.get<TopPerformer[]>('/analytics/top-performers', { params })
  return data
}

export const triggerSnapshotRefresh = async () => {
  const { data } = await apiClient.post('/analytics/refresh-snapshots')
  return data
}
