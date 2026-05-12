import { useQuery } from '@tanstack/react-query'
import { fetchAumFundwise, fetchAumPeriods, fetchAumSchemewise } from '../api/aum'

export const useAumSchemewise = (params: Parameters<typeof fetchAumSchemewise>[0]) =>
  useQuery({
    queryKey: ['aum-schemewise', params],
    queryFn: () => fetchAumSchemewise(params),
    retry: false,
  })

export const useAumFundwise = (params: Parameters<typeof fetchAumFundwise>[0]) =>
  useQuery({
    queryKey: ['aum-fundwise', params],
    queryFn: () => fetchAumFundwise(params),
    retry: false,
  })

export const useAumPeriods = () =>
  useQuery({
    queryKey: ['aum-periods'],
    queryFn: fetchAumPeriods,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
