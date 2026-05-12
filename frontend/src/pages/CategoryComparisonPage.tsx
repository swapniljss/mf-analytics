import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import apiClient from '../api/client'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'

// ── helpers ────────────────────────────────────────────────────────────────

function quartileBadge(q?: number | null) {
  if (q == null) return <span className="text-gray-300 text-xs">—</span>
  const map: Record<number, { label: string; cls: string }> = {
    1: { label: 'Q1', cls: 'bg-green-100 text-green-800' },
    2: { label: 'Q2', cls: 'bg-blue-100 text-blue-800' },
    3: { label: 'Q3', cls: 'bg-amber-100 text-amber-800' },
    4: { label: 'Q4', cls: 'bg-red-100 text-red-800' },
  }
  const entry = map[q]
  if (!entry) return <span className="text-gray-300 text-xs">—</span>
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${entry.cls}`}>
      {entry.label}
    </span>
  )
}

function fmtReturn(raw?: unknown) {
  if (raw == null) return '—'
  const v = Number(raw)
  if (isNaN(v)) return '—'
  const cls = v >= 0 ? 'text-green-600' : 'text-red-600'
  return <span className={`font-medium ${cls}`}>{v.toFixed(2)}%</span>
}

function fmtCr(raw?: unknown) {
  if (raw == null) return '—'
  const v = Number(raw)
  if (isNaN(v)) return '—'
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L Cr`
  if (v >= 1000)   return `₹${(v / 1000).toFixed(2)}K Cr`
  return `₹${v.toFixed(2)} Cr`
}

// ── types ──────────────────────────────────────────────────────────────────

interface ComparisonItem {
  rank: number
  amfi_code: string
  scheme_name: string
  amc_name?: string
  return_value?: number
  return_1y?: number
  return_3y?: number
  return_5y?: number
  aum_cr?: number
  expense_ratio?: number
  category_quartile?: number
}

interface ComparisonResponse {
  category: string
  total: number
  category_avg?: number
  category_max?: number
  category_min?: number
  items: ComparisonItem[]
}

// ── page ───────────────────────────────────────────────────────────────────

const PERIODS = [
  { value: 'return_1y', label: '1Y' },
  { value: 'return_3y', label: '3Y' },
  { value: 'return_5y', label: '5Y' },
]

export default function CategoryComparisonPage() {
  const navigate = useNavigate()
  const [category, setCategory] = useState('')
  const [period, setPeriod] = useState('return_1y')
  const [page, setPage] = useState(1)

  // Fetch categories list from scheme-master
  const { data: catsData } = useQuery<{ categories: string[] }>({
    queryKey: ['scheme-categories'],
    queryFn: () => apiClient.get('/analytics/categories').then(r => r.data),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch comparison data
  const { data, isLoading } = useQuery<ComparisonResponse>({
    queryKey: ['category-comparison', category, period, page],
    queryFn: () =>
      apiClient
        .get('/analytics/category/comparison', {
          params: { category, period, page, page_size: 50 },
        })
        .then(r => r.data),
    enabled: !!category,
    retry: false,
  })

  const periodLabel = PERIODS.find(p => p.value === period)?.label ?? ''

  return (
    <div className="p-6 space-y-4">
      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[240px]">
            <label className="text-xs text-gray-500 block mb-1">Category</label>
            <select
              value={category}
              onChange={e => { setCategory(e.target.value); setPage(1) }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a category…</option>
              {(catsData?.categories ?? []).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Period</label>
            <div className="flex gap-1">
              {PERIODS.map(p => (
                <button
                  key={p.value}
                  onClick={() => { setPeriod(p.value); setPage(1) }}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    period === p.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Category stats */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: `Avg Return (${periodLabel})`, value: data.category_avg != null ? `${Number(data.category_avg).toFixed(2)}%` : '—', cls: 'text-blue-700' },
            { label: `Max Return (${periodLabel})`, value: data.category_max != null ? `${Number(data.category_max).toFixed(2)}%` : '—', cls: 'text-green-700' },
            { label: `Min Return (${periodLabel})`, value: data.category_min != null ? `${Number(data.category_min).toFixed(2)}%` : '—', cls: 'text-red-700' },
            { label: 'Total Schemes', value: String(data.total), cls: 'text-gray-900' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="card border border-gray-100">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-xl font-bold mt-1 ${cls}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {!category ? (
        <EmptyState message="Select a category above to view the comparison table" />
      ) : isLoading ? (
        <Spinner />
      ) : !data?.items?.length ? (
        <EmptyState message="No schemes found for this category" />
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-header">Rank</th>
                  <th className="table-header">Scheme Name</th>
                  <th className="table-header">AMC</th>
                  <th className="table-header text-right">Return ({periodLabel})</th>
                  <th className="table-header text-right">1Y</th>
                  <th className="table-header text-right">3Y</th>
                  <th className="table-header text-right">5Y</th>
                  <th className="table-header text-right">AUM</th>
                  <th className="table-header text-right">Exp. Ratio</th>
                  <th className="table-header">Quartile</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.amfi_code} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="table-cell text-gray-400 tabular-nums font-medium">{row.rank}</td>
                    <td className="table-cell max-w-[240px]">
                      <button
                        onClick={() => navigate(`/schemes/${row.amfi_code}`)}
                        className="text-left text-blue-600 hover:text-blue-800 hover:underline font-medium text-sm block truncate"
                        title={row.scheme_name}
                      >
                        {row.scheme_name}
                      </button>
                    </td>
                    <td className="table-cell text-xs text-gray-500 max-w-[120px]">
                      <span className="block truncate" title={row.amc_name}>{row.amc_name || '—'}</span>
                    </td>
                    <td className="table-cell text-right tabular-nums">{fmtReturn(row.return_value)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtReturn(row.return_1y)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtReturn(row.return_3y)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtReturn(row.return_5y)}</td>
                    <td className="table-cell text-right tabular-nums text-gray-700">{fmtCr(row.aum_cr)}</td>
                    <td className="table-cell text-right tabular-nums text-gray-700">
                      {row.expense_ratio != null ? `${Number(row.expense_ratio).toFixed(2)}%` : '—'}
                    </td>
                    <td className="table-cell">{quartileBadge(row.category_quartile)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.total > 50 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Page {page} — showing {Math.min(page * 50, data.total)} of {data.total} schemes
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-secondary disabled:opacity-40 py-1.5 px-3 text-xs"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={data.items.length < 50}
                  className="btn-secondary disabled:opacity-40 py-1.5 px-3 text-xs"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
