import { useState } from 'react'
import { useAumFundwise, useAumPeriods, useAumSchemewise } from '../hooks/useAUM'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import { formatCrores, formatNumber } from '../utils/formatters'

export default function AUMPage() {
  const [activeTab, setActiveTab] = useState<'fund' | 'scheme'>('fund')
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput, 300)

  const { data: periods } = useAumPeriods()
  const [selectedFyId, setSelectedFyId] = useState<number | undefined>()
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | undefined>()

  const latestPeriod = periods?.[0]
  const fyId = selectedFyId ?? latestPeriod?.fy_id
  const periodId = selectedPeriodId ?? latestPeriod?.period_id

  const { data: fundData, isLoading: fundLoading } = useAumFundwise({
    fy_id: fyId, period_id: periodId, search: search || undefined, page, page_size: 50,
  })
  const { data: schemeData, isLoading: schemeLoading } = useAumSchemewise({
    fy_id: fyId, period_id: periodId, search: search || undefined, page, page_size: 50,
  })

  const isLoading = activeTab === 'fund' ? fundLoading : schemeLoading
  const data = activeTab === 'fund' ? fundData : schemeData

  return (
    <div className="p-6 space-y-4">
      {/* Controls */}
      <div className="card">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {(['fund', 'scheme'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setPage(1) }}
                className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
              >
                {tab === 'fund' ? 'Fund-wise (AMC)' : 'Scheme-wise'}
              </button>
            ))}
          </div>
          <select
            value={fyId ? `${fyId}-${periodId}` : ''}
            onChange={(e) => {
              const [fy, period] = e.target.value.split('-').map(Number)
              setSelectedFyId(fy); setSelectedPeriodId(period); setPage(1)
            }}
            className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {periods?.map((p) => (
              <option key={`${p.fy_id}-${p.period_id}`} value={`${p.fy_id}-${p.period_id}`}>
                {p.period_label || `FY${p.fy_id} P${p.period_id}`}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder={activeTab === 'fund' ? 'Search AMC...' : 'Search scheme...'}
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setPage(1) }}
            className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? <Spinner /> : !data?.items.length ? <EmptyState message="No AUM data — trigger a sync from the API" /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                <tr>
                  {activeTab === 'fund' ? (
                    <>
                      <th className="table-header">AMC / Fund House</th>
                      <th className="table-header text-right">Total AUM</th>
                      <th className="table-header text-right">Equity</th>
                      <th className="table-header text-right">Debt</th>
                      <th className="table-header text-right">Hybrid</th>
                      <th className="table-header text-right">Folios</th>
                    </>
                  ) : (
                    <>
                      <th className="table-header">Scheme</th>
                      <th className="table-header">AMC</th>
                      <th className="table-header">Category</th>
                      <th className="table-header text-right">Avg AUM</th>
                      <th className="table-header text-right">Folios</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {activeTab === 'fund'
                  ? (fundData?.items ?? []).map((f) => (
                    <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="table-cell font-medium text-gray-900 dark:text-white max-w-[200px]">
                        <span className="block truncate">{f.amc_name}</span>
                      </td>
                      <td className="table-cell text-right font-semibold">{formatCrores(f.total_aum_cr)}</td>
                      <td className="table-cell text-right text-green-700 dark:text-green-300">{formatCrores(f.equity_aum_cr)}</td>
                      <td className="table-cell text-right text-blue-700 dark:text-blue-300">{formatCrores(f.debt_aum_cr)}</td>
                      <td className="table-cell text-right text-purple-700 dark:text-purple-300">{formatCrores(f.hybrid_aum_cr)}</td>
                      <td className="table-cell text-right text-gray-500 dark:text-gray-400">{formatNumber(f.folio_count)}</td>
                    </tr>
                  ))
                  : (schemeData?.items ?? []).map((s) => (
                    <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="table-cell max-w-[260px]">
                        <span className="block truncate font-medium text-gray-900 dark:text-white">{s.scheme_name}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-400">{s.amfi_code}</span>
                      </td>
                      <td className="table-cell text-gray-500 dark:text-gray-400 text-xs max-w-[160px]">
                        <span className="block truncate">{s.amc_name}</span>
                      </td>
                      <td className="table-cell text-gray-500 dark:text-gray-400 text-xs max-w-[160px]">
                        <span className="block truncate">{s.scheme_category}</span>
                      </td>
                      <td className="table-cell text-right font-semibold">{formatCrores(s.average_aum_cr)}</td>
                      <td className="table-cell text-right text-gray-500 dark:text-gray-400">{formatNumber(s.folio_count)}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        )}
        {data && data.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">Page {data.page} of {data.total_pages} ({data.total.toLocaleString()} records)</p>
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
