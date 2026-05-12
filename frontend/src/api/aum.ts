import apiClient from './client'
import { AumFund, AumScheme, PaginatedResponse } from '../types'

export const fetchAumSchemewise = async (params: {
  fy_id?: number
  period_id?: number
  amc_name?: string
  category?: string
  search?: string
  page?: number
  page_size?: number
}) => {
  const { data } = await apiClient.get<PaginatedResponse<AumScheme>>('/aum/scheme-wise', { params })
  return data
}

export const fetchAumFundwise = async (params: {
  fy_id?: number
  period_id?: number
  search?: string
  page?: number
  page_size?: number
}) => {
  const { data } = await apiClient.get<PaginatedResponse<AumFund>>('/aum/fund-wise', { params })
  return data
}

export const fetchAumPeriods = async () => {
  const { data } = await apiClient.get<Array<{ fy_id: number; period_id: number; fy_label: string; period_label: string }>>('/aum/periods')
  return data
}

export const triggerAumSync = async (type: 'scheme-wise' | 'fund-wise', fyId: number, periodId: number) => {
  const { data } = await apiClient.post(`/aum/sync/${type}`, null, {
    params: { fy_id: fyId, period_id: periodId },
  })
  return data
}
