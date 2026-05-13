import { useState } from 'react'
import { Search, RefreshCw } from 'lucide-react'
import { useSchemes, useAmcList, useCategories } from '../hooks/useSchemes'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import Spinner from '../components/ui/Spinner'
import Toast from '../components/ui/Toast'
import EmptyState from '../components/ui/EmptyState'
import Badge, { statusBadgeVariant } from '../components/ui/Badge'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { triggerSchemeMasterSync } from '../api/schemes'
import { useNavigate } from 'react-router-dom'

export default function SchemesPage() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const [selectedAmc, setSelectedAmc] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedPlan, setSelectedPlan] = useState('')
  const [page, setPage] = useState(1)
  const search = useDebouncedValue(searchInput, 300)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useSchemes({
    search: search || undefined,
    amc_name: selectedAmc || undefined,
    category: selectedCategory || undefined,
    plan_type: selectedPlan || undefined,
    page,
    page_size: 50,
  })
  const { data: amcs } = useAmcList()
  const { data: categories } = useCategories()
  const syncMutation = useMutation({
    mutationFn: triggerSchemeMasterSync,
    onMutate: () => {
      setToast({ message: 'Syncing scheme master from AMFI… usually takes ~30 seconds.', type: 'info' })
    },
    onSuccess: (result) => {
      setToast({
        message: result?.message || 'Scheme master synced ✓',
        type: 'success',
      })
      // Refresh list + filter dropdowns so newly-synced schemes appear immediately.
      queryClient.invalidateQueries({ queryKey: ['schemes'] })
      queryClient.invalidateQueries({ queryKey: ['amcs'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      // Dashboard "Active Schemes" / "Total AMCs" KPI cards read these counts
      // via /analytics/summary; invalidate so the cards reflect the new total
      // without waiting for the 60s staleTime window.
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Scheme master sync failed — try again later.'
      setToast({ message: msg, type: 'error' })
    },
  })

  return (
    <div className="p-6 space-y-4">
      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by scheme name or AMFI code..."
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={selectedAmc}
            onChange={(e) => { setSelectedAmc(e.target.value); setPage(1) }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]"
          >
            <option value="">All AMCs</option>
            {amcs?.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select
            value={selectedCategory}
            onChange={(e) => { setSelectedCategory(e.target.value); setPage(1) }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[220px]"
          >
            <option value="">All Categories</option>
            {categories?.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={selectedPlan}
            onChange={(e) => { setSelectedPlan(e.target.value); setPage(1) }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Plans</option>
            <option value="Direct">Direct</option>
            <option value="Regular">Regular</option>
          </select>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            aria-disabled={syncMutation.isPending}
            title={syncMutation.isPending ? 'Syncing scheme master from AMFI — please wait' : undefined}
            className="btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={14} className={syncMutation.isPending ? 'animate-spin' : ''} />
            {syncMutation.isPending ? 'Syncing…' : 'Sync Master'}
          </button>
        </div>
        {data && (
          <p className="text-xs text-gray-400 mt-2">{data.total.toLocaleString('en-IN')} schemes found</p>
        )}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? <Spinner /> : !data?.items.length ? <EmptyState /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-header">AMFI Code</th>
                  <th className="table-header">Scheme Name</th>
                  <th className="table-header">AMC</th>
                  <th className="table-header">Category</th>
                  <th className="table-header">Plan</th>
                  <th className="table-header">Option</th>
                  <th className="table-header">ISIN</th>
                  <th className="table-header">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/schemes/${s.amfi_code}`)}
                  >
                    <td className="table-cell font-mono text-blue-600">{s.amfi_code}</td>
                    <td className="table-cell max-w-[260px]">
                      <span className="block truncate text-gray-900 font-medium" title={s.scheme_name}>{s.scheme_name}</span>
                    </td>
                    <td className="table-cell text-gray-500 max-w-[160px]">
                      <span className="block truncate">{s.amc_name || '—'}</span>
                    </td>
                    <td className="table-cell text-gray-500 max-w-[160px]">
                      <span className="block truncate text-xs">{s.scheme_category || '—'}</span>
                    </td>
                    <td className="table-cell">
                      {s.plan_type === 'Direct' && <Badge label="Direct" variant="blue" />}
                      {s.plan_type === 'Regular' && <Badge label="Regular" variant="gray" />}
                    </td>
                    <td className="table-cell text-xs text-gray-500">{s.option_type || '—'}</td>
                    <td className="table-cell font-mono text-xs text-gray-400">{s.isin_div_payout_growth || '—'}</td>
                    <td className="table-cell">
                      <Badge label={s.is_active === 'Y' ? 'Active' : 'Inactive'} variant={statusBadgeVariant(s.is_active)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* Pagination */}
        {data && data.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">Page {data.page} of {data.total_pages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary disabled:opacity-40 py-1.5 px-3 text-xs"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
                disabled={page === data.total_pages}
                className="btn-secondary disabled:opacity-40 py-1.5 px-3 text-xs"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <Toast message={toast?.message ?? null} type={toast?.type} onDismiss={() => setToast(null)} />
    </div>
  )
}
