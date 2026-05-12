import apiClient from './client'
import { PaginatedResponse, SchemeMaster } from '../types'

export const fetchSchemes = async (params: {
  search?: string
  amc_name?: string
  category?: string
  plan_type?: string
  is_active?: string
  page?: number
  page_size?: number
}) => {
  const { data } = await apiClient.get<PaginatedResponse<SchemeMaster>>('/scheme-master', { params })
  return data
}

export const fetchScheme = async (amfiCode: string) => {
  const { data } = await apiClient.get<SchemeMaster>(`/scheme-master/${amfiCode}`)
  return data
}

export const fetchAmcList = async (): Promise<string[]> => {
  const { data } = await apiClient.get<string[]>('/scheme-master/amcs')
  return data
}

export const fetchCategories = async (): Promise<string[]> => {
  const { data } = await apiClient.get<string[]>('/scheme-master/categories')
  return data
}

export const triggerSchemeMasterSync = async () => {
  const { data } = await apiClient.post('/scheme-master/sync')
  return data
}
