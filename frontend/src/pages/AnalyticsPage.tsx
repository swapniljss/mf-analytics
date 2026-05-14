import { useEffect, useRef, useState } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { useSnapshots } from '../hooks/useAnalytics'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { triggerSnapshotRefresh } from '../api/analytics'
import apiClient from '../api/client'
import TableSkeleton from '../components/ui/TableSkeleton'
import Toast from '../components/ui/Toast'
import EmptyState from '../components/ui/EmptyState'
import { formatCrores, formatDate, formatNAV, formatReturn, formatPercent, formatRelativeTime, returnColor } from '../utils/formatters'

// localStorage key for cross-mount refresh-state persistence — so navigating
// away and back doesn't lose the "Refresh in progress" indicator and let
// the user fire a second parallel refresh.
const REFRESH_STATE_KEY = 'mf:snapshot-refresh-state'

interface PersistedRefreshState {
  startedFromIso: string | null
  startedAtMs: number
}

function readPersistedRefreshState(maxDurationMs: number): PersistedRefreshState | null {
  try {
    const raw = localStorage.getItem(REFRESH_STATE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as PersistedRefreshState
    if (Date.now() - s.startedAtMs > maxDurationMs) {
      localStorage.removeItem(REFRESH_STATE_KEY)
      return null
    }
    return s
  } catch {
    return null
  }
}

function clearPersistedRefreshState() {
  try { localStorage.removeItem(REFRESH_STATE_KEY) } catch { /* ignore */ }
}

interface DashboardSummaryExt {
  total_active_schemes: number
  total_amcs: number
  latest_nav_date?: string
  total_industry_aum_cr?: number
  schemes_with_nav?: number
  schemes_with_returns?: number
  latest_snapshot_refreshed_at?: string
  data_status?: {
    has_nav: boolean
    has_returns: boolean
    needs_history_sync: boolean
  }
}

// When a refresh is in progress, poll /analytics/summary every this-many ms so
// the "Last refreshed X ago" badge stays current and we can detect completion.
const POLL_INTERVAL_MS = 30_000
// We consider the refresh "done" once the latest snapshot_refreshed_at on the
// server has moved more than this far past the value we captured at click time.
// A real bulk refresh moves it many minutes; a small/partial run won't trip this.
const REFRESH_COMPLETE_THRESHOLD_MS = 5 * 60 * 1000
// Hard cap so the user never gets permanently locked out if completion
// detection misses (e.g. partial run on a tiny local DB, network drop during
// poll). After this, we re-enable the button even without a "done" signal.
const REFRESH_MAX_DURATION_MS = 15 * 60 * 1000


export default function AnalyticsPage() {
  const [searchInput, setSearchInput] = useState('')
  const [categoryInput, setCategoryInput] = useState('')
  const [page, setPage] = useState(1)
  // Debounce typing by 300ms so a single API call fires after the user
  // stops typing — not one per keystroke.
  const search = useDebouncedValue(searchInput, 300)
  const category = useDebouncedValue(categoryInput, 300)

  // Snapshot of the server's latest refresh time captured at click — used to
  // detect when a new background refresh has completed. Persisted in
  // localStorage so navigating away (which unmounts this lazy-loaded page)
  // doesn't lose the in-progress state.
  const refreshStartedFromRef = useRef<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(() => {
    const s = readPersistedRefreshState(REFRESH_MAX_DURATION_MS)
    if (s) {
      refreshStartedFromRef.current = s.startedFromIso
      return true
    }
    return false
  })
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null)
  const queryClient = useQueryClient()
  // Re-render every 30s so the "Last refreshed X ago" string stays current
  // even when the user is idle on the page (no other state changes).
  const [, forceTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => forceTick(n => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  const { data: summary } = useQuery<DashboardSummaryExt>({
    queryKey: ['analytics-summary'],
    queryFn: () => apiClient.get('/analytics/summary').then(r => r.data),
    staleTime: 60_000,
    refetchInterval: isRefreshing ? POLL_INTERVAL_MS : false,
  })

  const { data, isLoading, refetch } = useSnapshots({
    search: search || undefined,
    category: category || undefined,
    page,
    page_size: 50,
  })

  const refreshMutation = useMutation({
    mutationFn: triggerSnapshotRefresh,
    onSuccess: () => {
      const startedFrom = summary?.latest_snapshot_refreshed_at ?? null
      refreshStartedFromRef.current = startedFrom
      setIsRefreshing(true)
      try {
        localStorage.setItem(REFRESH_STATE_KEY, JSON.stringify({
          startedFromIso: startedFrom,
          startedAtMs: Date.now(),
        }))
      } catch { /* ignore quota / private-mode errors */ }
      setToast({
        message: 'Snapshot refresh started — will run in the background (~7-8 min).',
        type: 'info',
      })
    },
  })

  // Detect background refresh completion: the server's MAX(snapshot_refreshed_at)
  // has advanced past our captured "started from" value by more than the
  // threshold, meaning a real bulk run wrote many fresh rows.
  useEffect(() => {
    if (!isRefreshing) return
    const current = summary?.latest_snapshot_refreshed_at
    const startedFrom = refreshStartedFromRef.current
    if (!current) return
    const advancedMs = startedFrom
      ? new Date(current).getTime() - new Date(startedFrom).getTime()
      : Number.POSITIVE_INFINITY
    if (advancedMs >= REFRESH_COMPLETE_THRESHOLD_MS) {
      setIsRefreshing(false)
      refreshStartedFromRef.current = null
      clearPersistedRefreshState()
      setToast({
        message: `Snapshot refresh complete · ${summary?.total_active_schemes?.toLocaleString('en-IN') ?? ''} schemes updated.`,
        type: 'success',
      })
      // Force the summary + snapshots queries to refetch so the "Last refreshed
      // X ago" badge and the table show the post-refresh data without waiting
      // for the next staleTime window. Also invalidate 'dashboard-summary'
      // (the TopBar pill + Dashboard card use that separate query key).
      queryClient.invalidateQueries({ queryKey: ['analytics-summary'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      refetch()
    }
  }, [summary?.latest_snapshot_refreshed_at, isRefreshing, summary?.total_active_schemes, refetch, queryClient])

  // Safety: re-enable the button after REFRESH_MAX_DURATION_MS in case
  // completion detection never fires (partial refresh / network drop).
  useEffect(() => {
    if (!isRefreshing) return
    const t = setTimeout(() => {
      setIsRefreshing(false)
      refreshStartedFromRef.current = null
      clearPersistedRefreshState()
    }, REFRESH_MAX_DURATION_MS)
    return () => clearTimeout(t)
  }, [isRefreshing])

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
              className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
            />
            <input
              type="text"
              placeholder="Filter by category..."
              value={categoryInput}
              onChange={(e) => { setCategoryInput(e.target.value); setPage(1) }}
              className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
            />
          </div>
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending || isRefreshing}
            aria-disabled={refreshMutation.isPending || isRefreshing}
            title={isRefreshing ? 'A refresh is already running in the background — please wait until it completes.' : undefined}
            className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={14} className={(refreshMutation.isPending || isRefreshing) ? 'animate-spin' : ''} />
            {isRefreshing ? 'Refresh in progress…' : refreshMutation.isPending ? 'Refreshing...' : 'Refresh Snapshots'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400 dark:text-gray-400">
          {data && <span>{data.total.toLocaleString('en-IN')} schemes with snapshot data</span>}
          {summary?.latest_snapshot_refreshed_at && (
            <span aria-label="Snapshot freshness">
              · Last refreshed: <span className="font-medium text-gray-600 dark:text-gray-300">{formatRelativeTime(summary.latest_snapshot_refreshed_at)}</span>
            </span>
          )}
        </div>
      </div>

      {/* Data-sync banner — shown when NAV history hasn't been loaded */}
      {summary?.data_status?.needs_history_sync && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500 dark:text-amber-400" />
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
        {isLoading ? <TableSkeleton rows={10} cols={11} /> : !data?.items.length ? (
          <EmptyState message="No snapshot data — click Refresh Snapshots to compute returns" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
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
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="table-cell max-w-[220px]">
                      <span className="block truncate font-medium text-gray-900 dark:text-white">{s.scheme_name}</span>
                      <span className="text-gray-400 dark:text-gray-400">{s.amc_name}</span>
                    </td>
                    <td className="table-cell">
                      <span className="font-medium">{formatNAV(s.latest_nav)}</span>
                      <span className="block text-gray-400 dark:text-gray-400">{formatDate(s.nav_date)}</span>
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">Page {data.page} of {data.total_pages}</p>
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
