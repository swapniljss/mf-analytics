import apiClient from './client'
import { DailyNAV, NavPrice, PaginatedResponse } from '../types'

export const fetchDailyNav = async (params: {
  search?: string
  amfi_code?: string
  nav_date?: string
  page?: number
  page_size?: number
}) => {
  const { data } = await apiClient.get<PaginatedResponse<DailyNAV>>('/nav/daily', { params })
  return data
}

export const fetchLatestNavDate = async () => {
  const { data } = await apiClient.get<{ latest_nav_date: string | null }>('/nav/daily/latest-date')
  return data
}

export const fetchNavHistory = async (amfiCode: string, fromDate: string, toDate: string) => {
  const { data } = await apiClient.get<NavPrice[]>(`/nav/${amfiCode}/history`, {
    params: { from_date: fromDate, to_date: toDate },
  })
  return data
}

export const triggerDailyNavSync = async () => {
  const { data } = await apiClient.post('/nav/sync')
  return data
}

export const fetchHistoricalBatches = async (params: { page?: number; page_size?: number }) => {
  const { data } = await apiClient.get('/nav/historical/batches', { params })
  return data
}
