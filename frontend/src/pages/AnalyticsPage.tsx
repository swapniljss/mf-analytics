import { useState } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { useSnapshots } from '../hooks/useAnalytics'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useMutation, useQuery } from '@tanstack/react-query'
import { triggerSnapshotRefresh } from '../api/analytics'
import apiClient from '../api/client'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import { formatCrores, formatDate, formatNAV, formatReturn, formatPercent, returnColor } from '../utils/formatters'

interface DashboardSummaryExt {
  total_active_schemes: number
  total_amcs: number
  latest_nav_date?: string
  total_industry_aum_cr?: number
  schemes_with_nav?: number
  schemes_with_returns?: number
  data_status?: {
    has_nav: boolean
    has_returns: boolean
    needs_history_sync: boolean
  }
}


export default function AnalyticsPage() {
  const [searchInput, setSearchInput] = useState('')
  const [categoryInput, setCategoryInput] = useState('')
  const [page, setPage] = useState(1)
  // Debounce typing by 300ms so a single API call fires after the user
  // stops typing — not one per keystroke.
  const search = useDebouncedValue(searchInput, 300)
  const category = useDebouncedValue(categoryInput, 300)

  const { data: summary } = useQuery<DashboardSummaryExt>({
    queryKey: ['analytics-summary'],
    queryFn: () => apiClient.get('/analytics/summary').then(r => r.data),
    staleTime: 60_000,
  })

  const { data, isLoading, refetch } = useSnapshots({
    search: search || undefined,
    category: category || undefined,
    page,
    page_size: 50,
  })

  const refreshMutation = useMutation({
    mutationFn: triggerSnapshotRefresh,
    onSuccess: () => refetch(),
  })

  return (
    <div className="p-6 space-y-4">
      <div className="card">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-3 flex-1">
            <input
              type="text"
              placeholder="Search schemes..."
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); setPage(1) }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
            />
            <input
              type="text"
              placeholder="Filter by category..."
              value={categoryInput}
              onChange={(e) => { setCategoryInput(e.target.value); setPage(1) }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
            />
          </div>
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="btn-primary flex items-center gap-2"
          >
            <RefreshCw size={14} className={refreshMutation.isPending ? 'animate-spin' : ''} />
            {refreshMutation.isPending ? 'Refreshing...' : 'Refresh Snapshots'}
          </button>
        </div>
        {data && <p className="text-xs text-gray-400 mt-2">{data.total.toLocaleString('en-IN')} schemes with snapshot data</p>}
      </div>

      {/* Data-sync banner — shown when NAV history hasn't been loaded */}
      {summary?.data_status?.needs_history_sync && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
          <div>
            <span className="font-semibold">Return data not yet loaded.</span>{' '}
            {summary.schemes_with_returns != null && (
              <span>Only {summary.schemes_with_returns.toLocaleString('en-IN')} of {(summary.schemes_with_nav ?? 0).toLocaleString('en-IN')} schemes have period returns. </span>
            )}
            To populate 1W–5Y returns, run{' '}
            <code className="rounded bg-amber-100 px-1 font-mono text-xs">POST /nav/historical/fetch-range</code>{' '}
            to load historical NAV, then click{' '}
            <strong>Refresh Snapshots</strong>.
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        {isLoading ? <Spinner /> : !data?.items.length ? (
          <EmptyState message="No snapshot data — click Refresh Snapshots to compute returns" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-header">Scheme</th>
                  <th className="table-header">NAV</th>
                  <th className="table-header text-right">1W</th>
                  <th className="table-header text-right">1M</th>
                  <th className="table-header text-right">3M</th>
                  <th className="table-header text-right">6M</th>
                  <th className="table-header text-right">1Y</th>
                  <th className="table-header text-right">3Y</th>
                  <th className="table-header text-right">5Y</th>
                  <th className="table-header text-right">AUM</th>
                  <th className="table-header text-right">Exp Ratio</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="table-cell max-w-[220px]">
                      <span className="block truncate font-medium text-gray-900">{s.scheme_name}</span>
                      <span className="text-gray-400">{s.amc_name}</span>
                    </td>
                    <td className="table-cell">
                      <span className="font-medium">{formatNAV(s.latest_nav)}</span>
                      <span className="block text-gray-400">{formatDate(s.nav_date)}</span>
                    </td>
                    {(['return_1w', 'return_1m', 'return_3m', 'return_6m', 'return_1y', 'return_3y', 'return_5y'] as const).map((key) => (
                      <td key={key} className={`table-cell text-right font-medium ${returnColor(s[key])}`}>
                        {formatReturn(s[key])}
                      </td>
                    ))}
                    <td className="table-cell text-right">{formatCrores(s.aum_cr)}</td>
                    <td className="table-cell text-right">{formatPercent(s.expense_ratio)}</td>
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
    </div>
  )
}
