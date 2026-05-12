import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { fetchTrackingError, fetchTrackingDifference, triggerTrackingSync } from '../api/tracking'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import { formatDate, formatPercent } from '../utils/formatters'

export default function TrackingPage() {
  const [activeTab, setActiveTab] = useState<'error' | 'difference'>('error')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const { data: teData, isLoading: teLoading, refetch: teRefetch } = useQuery({
    queryKey: ['tracking-error', search, page],
    queryFn: () => fetchTrackingError({ amc_name: search || undefined, page, page_size: 100 }),
  })
  const { data: tdData, isLoading: tdLoading, refetch: tdRefetch } = useQuery({
    queryKey: ['tracking-diff', search, page],
    queryFn: () => fetchTrackingDifference({ amc_name: search || undefined, page, page_size: 100 }),
  })

  const syncMutation = useMutation({
    mutationFn: (type: 'error' | 'difference') => triggerTrackingSync(type),
    onSuccess: () => { teRefetch(); tdRefetch() },
  })

  const isLoading = activeTab === 'error' ? teLoading : tdLoading
  const data = activeTab === 'error' ? teData : tdData

  return (
    <div className="p-6 space-y-4">
      <div className="card">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(['error', 'difference'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setPage(1) }}
                className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                Tracking {tab === 'error' ? 'Error' : 'Difference'}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search AMC..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-[180px]"
          />
          <button
            onClick={() => syncMutation.mutate(activeTab)}
            disabled={syncMutation.isPending}
            className="btn-primary flex items-center gap-2"
          >
            <RefreshCw size={14} className={syncMutation.isPending ? 'animate-spin' : ''} />
            Sync {activeTab === 'error' ? 'TE' : 'TD'}
          </button>
        </div>
        {data && <p className="text-xs text-gray-400 mt-2">{data.total.toLocaleString('en-IN')} records</p>}
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? <Spinner /> : !data?.items.length ? <EmptyState message="No tracking data — trigger a sync" /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-header">Scheme</th>
                  <th className="table-header">AMC</th>
                  <th className="table-header">Benchmark</th>
                  {activeTab === 'error' ? (
                    <>
                      <th className="table-header text-right">TE</th>
                      <th className="table-header">Period</th>
                      <th className="table-header">As of Date</th>
                    </>
                  ) : (
                    <>
                      <th className="table-header text-right">TD</th>
                      <th className="table-header">Month</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {activeTab === 'error'
                  ? teData?.items.map((te) => (
                    <tr key={te.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="table-cell max-w-[240px]"><span className="block truncate font-medium">{te.scheme_name}</span></td>
                      <td className="table-cell text-gray-500 max-w-[160px]"><span className="block truncate text-xs">{te.amc_name}</span></td>
                      <td className="table-cell text-gray-500 max-w-[180px]"><span className="block truncate text-xs">{te.benchmark_name || '—'}</span></td>
                      <td className="table-cell text-right font-semibold text-orange-600">{formatPercent(te.tracking_error)}</td>
                      <td className="table-cell"><span className="badge-blue">{te.period_type || '—'}</span></td>
                      <td className="table-cell text-gray-500">{formatDate(te.as_of_date)}</td>
                    </tr>
                  ))
                  : tdData?.items.map((td) => (
                    <tr key={td.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="table-cell max-w-[240px]"><span className="block truncate font-medium">{td.scheme_name}</span></td>
                      <td className="table-cell text-gray-500 max-w-[160px]"><span className="block truncate text-xs">{td.amc_name}</span></td>
                      <td className="table-cell text-gray-500 max-w-[180px]"><span className="block truncate text-xs">{td.benchmark_name || '—'}</span></td>
                      <td className="table-cell text-right font-semibold text-purple-600">{formatPercent(td.tracking_difference)}</td>
                      <td className="table-cell text-gray-500">{formatDate(td.report_month)}</td>
                    </tr>
                  ))
                }
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
