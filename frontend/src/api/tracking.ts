import apiClient from './client'
import { PaginatedResponse, TrackingDifference, TrackingError } from '../types'

export const fetchTrackingError = async (params: {
  amfi_code?: string
  amc_name?: string
  period_type?: string
  as_of_date?: string
  page?: number
  page_size?: number
}) => {
  const { data } = await apiClient.get<PaginatedResponse<TrackingError>>('/tracking/error', { params })
  return data
}

export const fetchTrackingDifference = async (params: {
  amfi_code?: string
  amc_name?: string
  report_month?: string
  page?: number
  page_size?: number
}) => {
  const { data } = await apiClient.get<PaginatedResponse<TrackingDifference>>('/tracking/difference', { params })
  return data
}

export const fetchTrackingErrorHistory = async (amfiCode: string) => {
  const { data } = await apiClient.get<TrackingError[]>(`/tracking/${amfiCode}/error-history`)
  return data
}

export const fetchTrackingDiffHistory = async (amfiCode: string) => {
  const { data } = await apiClient.get<TrackingDifference[]>(`/tracking/${amfiCode}/difference-history`)
  return data
}

export const triggerTrackingSync = async (type: 'error' | 'difference', date?: string) => {
  const { data } = await apiClient.post(`/tracking/sync/${type}`, null, {
    params: type === 'error' ? { as_of_date: date } : { report_month: date },
  })
  return data
}
