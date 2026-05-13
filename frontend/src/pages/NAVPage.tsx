import { useState } from 'react'
import { Search, RefreshCw } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchDailyNav, fetchLatestNavDate, triggerDailyNavSync } from '../api/nav'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import Spinner from '../components/ui/Spinner'
import Toast from '../components/ui/Toast'
import EmptyState from '../components/ui/EmptyState'
import { formatDate, formatNAV } from '../utils/formatters'

export default function NAVPage() {
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const search = useDebouncedValue(searchInput, 300)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['daily-nav', search, page],
    queryFn: () => fetchDailyNav({ search: search || undefined, page, page_size: 100 }),
  })
  const { data: latestDate } = useQuery({
    queryKey: ['latest-nav-date'],
    queryFn: fetchLatestNavDate,
  })
  const syncMutation = useMutation({
    mutationFn: triggerDailyNavSync,
    onMutate: () => {
      setToast({ message: "Fetching today's NAV from AMFI… usually takes ~10 seconds.", type: 'info' })
    },
    onSuccess: (result) => {
      setToast({
        message: result?.message || "Today's NAV synced ✓",
        type: 'success',
      })
      refetch()
      queryClient.invalidateQueries({ queryKey: ['latest-nav-date'] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'NAV sync failed — try again later.'
      setToast({ message: msg, type: 'error' })
    },
  })

  return (
    <div className="p-6 space-y-4">
      <div className="card">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search scheme name..."
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            {latestDate?.latest_nav_date && (
              <span className="text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">
                Latest: {formatDate(latestDate.latest_nav_date)}
              </span>
            )}
            <button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              aria-disabled={syncMutation.isPending}
              title={syncMutation.isPending ? "Fetching today's NAV from AMFI — please wait" : undefined}
              className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={14} className={syncMutation.isPending ? 'animate-spin' : ''} />
              {syncMutation.isPending ? 'Fetching…' : "Fetch Today's NAV"}
            </button>
          </div>
        </div>
        {data && <p className="text-xs text-gray-400 mt-2">{data.total.toLocaleString('en-IN')} records</p>}
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? <Spinner /> : !data?.items.length ? <EmptyState message="No NAV data — click Fetch Today's NAV" /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-header">AMFI Code</th>
                  <th className="table-header">Scheme Name</th>
                  <th className="table-header">Fund House</th>
                  <th className="table-header">ISIN</th>
                  <th className="table-header text-right">NAV</th>
                  <th className="table-header text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((nav) => (
                  <tr key={nav.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="table-cell font-mono text-blue-600 text-xs">{nav.amfi_code}</td>
                    <td className="table-cell max-w-[280px]">
                      <span className="block truncate">{nav.scheme_name}</span>
                    </td>
                    <td className="table-cell text-gray-500 max-w-[180px]">
                      <span className="block truncate text-xs">{nav.fund_house || '—'}</span>
                    </td>
                    <td className="table-cell font-mono text-xs text-gray-400">{nav.isin_div_payout_growth || '—'}</td>
                    <td className="table-cell text-right font-semibold text-gray-900">{formatNAV(nav.nav)}</td>
                    <td className="table-cell text-right text-gray-500">{formatDate(nav.nav_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">Page {data.page} of {data.total_pages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary disabled:opacity-40 py-1.5 px-3 text-xs">Previous</button>
              <button onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))} disabled={page === data.total_pages} className="btn-secondary disabled:opacity-40 py-1.5 px-3 text-xs">Next</button>
            </div>
          </div>
        )}
      </div>

      <Toast message={toast?.message ?? null} type={toast?.type} onDismiss={() => setToast(null)} />
    </div>
  )
}
