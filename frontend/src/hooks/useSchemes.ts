import { useQuery } from '@tanstack/react-query'
import { fetchSchemes, fetchScheme, fetchAmcList, fetchCategories } from '../api/schemes'

export const useSchemes = (params: Parameters<typeof fetchSchemes>[0]) =>
  useQuery({
    queryKey: ['schemes', params],
    queryFn: () => fetchSchemes(params),
  })

export const useScheme = (amfiCode: string) =>
  useQuery({
    queryKey: ['scheme', amfiCode],
    queryFn: () => fetchScheme(amfiCode),
    enabled: !!amfiCode,
  })

export const useAmcList = () =>
  useQuery({
    queryKey: ['amcs'],
    queryFn: fetchAmcList,
    staleTime: 10 * 60 * 1000,
  })

export const useCategories = () =>
  useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: 10 * 60 * 1000,
  })
