import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  fetchDashboardSummary, fetchSnapshots, fetchSchemeSnapshot,
  fetchSchemeReturns, fetchTopPerformers,
} from '../api/analytics'

export const useDashboardSummary = () =>
  useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: fetchDashboardSummary,
    staleTime: 60 * 1000,
  })

export const useSnapshots = (params: Parameters<typeof fetchSnapshots>[0]) =>
  useQuery({
    queryKey: ['snapshots', params],
    queryFn: () => fetchSnapshots(params),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  })

export const useSchemeSnapshot = (amfiCode: string) =>
  useQuery({
    queryKey: ['snapshot', amfiCode],
    queryFn: () => fetchSchemeSnapshot(amfiCode),
    enabled: !!amfiCode,
    retry: false,
    staleTime: 30 * 1000,
  })

export const useSchemeReturns = (amfiCode: string, fromDate?: string, toDate?: string) =>
  useQuery({
    queryKey: ['returns', amfiCode, fromDate, toDate],
    queryFn: () => fetchSchemeReturns(amfiCode, fromDate, toDate),
    enabled: !!amfiCode,
    retry: false,
    staleTime: 30 * 1000,
  })

export const useTopPerformers = (params: Parameters<typeof fetchTopPerformers>[0]) =>
  useQuery({
    queryKey: ['top-performers', params],
    queryFn: () => fetchTopPerformers(params),
  })
