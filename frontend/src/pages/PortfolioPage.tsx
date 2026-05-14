import { useState } from 'react'
import { Upload, Search, CheckCircle, AlertCircle, X } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import apiClient from '../api/client'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import Badge from '../components/ui/Badge'

// ── helpers ────────────────────────────────────────────────────────────────

function formatCr(v?: number | null) {
  if (v == null) return '—'
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L Cr`
  if (v >= 1000)   return `₹${(v / 1000).toFixed(2)}K Cr`
  return `₹${v.toFixed(2)} Cr`
}

function ratingVariant(rating?: string | null): 'green' | 'blue' | 'yellow' | 'red' | 'gray' {
  if (!rating) return 'gray'
  const r = rating.toUpperCase()
  if (r.startsWith('AAA') || r === 'A1+') return 'green'
  if (r.startsWith('AA')) return 'blue'
  if (r.startsWith('A')) return 'yellow'
  if (r.startsWith('B') || r.startsWith('C') || r.startsWith('D')) return 'red'
  return 'gray'
}

// ── types ──────────────────────────────────────────────────────────────────

interface HoldingRow {
  id: number
  company_name: string
  company_isin?: string | null
  sector?: string | null
  security_class?: string | null
  rating?: string | null
  market_value_cr?: number | null
  percentage_exposure?: number | null
  quantity?: number | null
}

interface ConcentrationData {
  total_holdings: number
  top5_weight: number
  top10_weight: number
  hhi: number
  top10: { company_name: string; weight: number }[]
}

// ── Concentration Panel (popup) ────────────────────────────────────────────

function ConcentrationPanel({
  amfiCode,
  onClose,
}: {
  amfiCode: string
  onClose: () => void
}) {
  const { data, isLoading } = useQuery<ConcentrationData>({
    queryKey: ['concentration', amfiCode],
    queryFn: () => apiClient.get(`/portfolio/concentration/${amfiCode}`).then(r => r.data),
    enabled: !!amfiCode,
    retry: false,
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Concentration Analysis
            <span className="ml-2 text-xs text-gray-400 dark:text-gray-400 font-normal">{amfiCode}</span>
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-400">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">
          {isLoading ? (
            <Spinner size="sm" />
          ) : !data ? (
            <p className="text-sm text-gray-400 dark:text-gray-400">No concentration data available.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total Holdings', value: String(data.total_holdings) },
                  { label: 'Top 5 Weight', value: `${data.top5_weight?.toFixed(2)}%` },
                  { label: 'Top 10 Weight', value: `${data.top10_weight?.toFixed(2)}%` },
                  { label: 'HHI', value: data.hhi?.toFixed(4) ?? '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                    <p className="text-base font-bold text-gray-900 dark:text-white mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              {data.top10?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Top 10 Holdings</p>
                  <div className="space-y-1.5">
                    {data.top10.map((h, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 dark:text-gray-400 w-4 shrink-0">{i + 1}</span>
                        <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate" title={h.company_name}>
                          {h.company_name}
                        </span>
                        <div className="w-24 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                          <div
                            className="bg-blue-500 h-1.5 rounded-full"
                            style={{ width: `${Math.min(100, h.weight)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-700 dark:text-gray-300 tabular-nums w-12 text-right">
                          {h.weight?.toFixed(2)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Holdings Browser tab ───────────────────────────────────────────────────

function HoldingsBrowser() {
  const [reportMonth, setReportMonth] = useState('')
  const [amfiCode, setAmfiCode] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [sector, setSector] = useState('')
  const [page, setPage] = useState(1)
  const [concentrationAmfi, setConcentrationAmfi] = useState<string | null>(null)
  const search = useDebouncedValue(searchInput, 300)

  // Months list
  const { data: monthsData } = useQuery<{ months: string[] }>({
    queryKey: ['portfolio-months'],
    queryFn: () => apiClient.get('/portfolio/months').then(r => r.data),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  // Sectors list (depends on selected month)
  const { data: sectorsData } = useQuery<{ sectors: string[] }>({
    queryKey: ['portfolio-sectors', reportMonth],
    queryFn: () =>
      apiClient
        .get('/portfolio/sectors', { params: reportMonth ? { report_month: reportMonth } : {} })
        .then(r => r.data),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  // Holdings data
  const { data, isLoading } = useQuery({
    queryKey: ['portfolio-holdings', reportMonth, amfiCode, sector, search, page],
    queryFn: () =>
      apiClient
        .get('/portfolio/holdings', {
          params: {
            report_month: reportMonth || undefined,
            amfi_code: amfiCode || undefined,
            sector: sector || undefined,
            search: search || undefined,
            page,
            page_size: 100,
          },
        })
        .then(r => r.data),
    retry: false,
  })

  function resetPage() {
    setPage(1)
  }

  return (
    <>
      {concentrationAmfi && (
        <ConcentrationPanel
          amfiCode={concentrationAmfi}
          onClose={() => setConcentrationAmfi(null)}
        />
      )}
      <div className="space-y-4">
        {/* Filters */}
        <div className="card p-0 overflow-hidden">
          <div className="flex flex-wrap gap-3 p-4 border-b border-gray-100 dark:border-gray-800">
            {/* Month selector */}
            <select
              value={reportMonth}
              onChange={e => { setReportMonth(e.target.value); resetPage() }}
              className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[160px]"
            >
              <option value="">All Months</option>
              {(monthsData?.months ?? []).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            {/* AMFI code */}
            <input
              type="text"
              placeholder="AMFI code (optional)"
              value={amfiCode}
              onChange={e => { setAmfiCode(e.target.value); resetPage() }}
              className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
            />

            {/* Company search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-400" />
              <input
                type="text"
                placeholder="Search company…"
                value={searchInput}
                onChange={e => { setSearchInput(e.target.value); resetPage() }}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Sector dropdown */}
            <select
              value={sector}
              onChange={e => { setSector(e.target.value); resetPage() }}
              className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[160px]"
            >
              <option value="">All Sectors</option>
              {(sectorsData?.sectors ?? []).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            {/* Concentration button (enabled when AMFI code typed) */}
            {amfiCode.trim() && (
              <button
                onClick={() => setConcentrationAmfi(amfiCode.trim())}
                className="btn-secondary text-xs py-2 px-3 whitespace-nowrap"
              >
                Concentration
              </button>
            )}

            {data?.total != null && (
              <span className="self-center text-xs text-gray-400 dark:text-gray-400">
                {data.total.toLocaleString('en-IN')} holdings
              </span>
            )}
          </div>

          {/* Table */}
          {isLoading ? (
            <Spinner />
          ) : !data?.items?.length ? (
            <EmptyState message="No holdings found — try a different filter or upload portfolio data" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                  <tr>
                    <th className="table-header">Company Name</th>
                    <th className="table-header">ISIN</th>
                    <th className="table-header">Sector</th>
                    <th className="table-header">Security Class</th>
                    <th className="table-header">Rating</th>
                    <th className="table-header text-right">Market Value</th>
                    <th className="table-header text-right">% Exposure</th>
                    <th className="table-header text-right">Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.items as HoldingRow[]).map(row => (
                    <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="table-cell max-w-[220px]">
                        <span className="block truncate font-medium text-gray-900 dark:text-white" title={row.company_name}>
                          {row.company_name}
                        </span>
                      </td>
                      <td className="table-cell font-mono text-xs text-gray-400 dark:text-gray-400">{row.company_isin || '—'}</td>
                      <td className="table-cell text-xs text-gray-500 dark:text-gray-400 max-w-[140px]">
                        <span className="block truncate" title={row.sector ?? ''}>{row.sector || '—'}</span>
                      </td>
                      <td className="table-cell text-xs text-gray-500 dark:text-gray-400">{row.security_class || '—'}</td>
                      <td className="table-cell">
                        {row.rating
                          ? <Badge label={row.rating} variant={ratingVariant(row.rating)} />
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                      </td>
                      <td className="table-cell text-right tabular-nums text-gray-800 dark:text-gray-200">
                        {formatCr(row.market_value_cr)}
                      </td>
                      <td className="table-cell text-right tabular-nums text-gray-800 dark:text-gray-200">
                        {row.percentage_exposure != null
                          ? `${row.percentage_exposure.toFixed(2)}%`
                          : '—'}
                      </td>
                      <td className="table-cell text-right tabular-nums text-gray-500 dark:text-gray-400">
                        {row.quantity != null && row.quantity > 0
                          ? row.quantity.toLocaleString('en-IN')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {data && data.total > 100 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Page {page} — showing {Math.min(page * 100, data.total).toLocaleString('en-IN')} of {data.total.toLocaleString('en-IN')}
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
                  disabled={data.items.length < 100}
                  className="btn-secondary disabled:opacity-40 py-1.5 px-3 text-xs"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Upload tab ─────────────────────────────────────────────────────────────

function UploadTab() {
  const [reportMonth, setReportMonth] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploadResult, setUploadResult] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!reportMonth) throw new Error('Please select a report month')
      if (!file) throw new Error('Please select a CSV or Excel file')
      const form = new FormData()
      form.append('file', file)
      form.append('report_month', reportMonth)
      const { data } = await apiClient.post('/portfolio/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onSuccess: (data) => {
      setUploadResult(data.message || 'Upload successful')
      setUploadError(null)
      setFile(null)
    },
    onError: (err: Error) => {
      setUploadError(err.message)
      setUploadResult(null)
    },
  })

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Upload Portfolio Holdings</h3>
          <p className="text-xs text-gray-400 dark:text-gray-400 mt-0.5">
            Upload a CSV or Excel file for a specific report month. Existing holdings for that month will be replaced.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          {/* Report month */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
              Report Month <span className="text-red-400">*</span>
            </label>
            <input
              type="month"
              value={reportMonth}
              onChange={e => { setReportMonth(e.target.value); setUploadResult(null); setUploadError(null) }}
              className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* File input */}
          <div className="flex-1 min-w-[260px]">
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
              File <span className="text-gray-400 dark:text-gray-400">(.csv, .xlsx)</span>
            </label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={e => {
                setFile(e.target.files?.[0] || null)
                setUploadResult(null)
                setUploadError(null)
              }}
              className="block w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300
                         file:mr-3 file:py-1 file:px-3 file:rounded file:border-0
                         file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700
                         hover:file:bg-blue-100"
            />
          </div>

          <button
            onClick={() => uploadMutation.mutate()}
            disabled={!file || !reportMonth || uploadMutation.isPending}
            className="btn-primary flex items-center gap-2 disabled:opacity-40"
          >
            <Upload size={14} />
            {uploadMutation.isPending ? 'Uploading…' : 'Upload'}
          </button>
        </div>

        {/* Feedback */}
        {uploadResult && (
          <div className="flex items-start gap-2 text-sm bg-green-50 border border-green-200 text-green-800 rounded-lg px-3 py-2">
            <CheckCircle size={15} className="mt-0.5 shrink-0" />
            <span>{uploadResult}</span>
          </div>
        )}
        {uploadError && (
          <div className="flex items-start gap-2 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}

        {/* Column reference */}
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
          <p className="font-semibold">Required columns</p>
          <p className="font-mono">amfi_code, company_name</p>
          <p className="font-semibold mt-2">Optional columns</p>
          <p className="font-mono leading-relaxed">
            company_isin, sector, quantity, market_value_cr, percentage_exposure,
            security_class, rating, rating_agency, avg_maturity_years, modified_duration
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Overlap Analysis tab ───────────────────────────────────────────────────

interface CommonHolding {
  company_name: string
  scheme_1_weight: number
  scheme_2_weight: number
}

interface OverlapData {
  overlap_percentage: number
  common_stocks: number
  common_holdings: CommonHolding[]
}

function OverlapTab() {
  const [amfi1, setAmfi1] = useState('')
  const [amfi2, setAmfi2] = useState('')
  const [enabled, setEnabled] = useState(false)

  const { data, isLoading, isError } = useQuery<OverlapData>({
    queryKey: ['overlap', amfi1.trim(), amfi2.trim()],
    queryFn: () =>
      apiClient
        .get('/portfolio/overlap', {
          params: { amfi_code_1: amfi1.trim(), amfi_code_2: amfi2.trim() },
        })
        .then(r => r.data),
    enabled: enabled && !!amfi1.trim() && !!amfi2.trim(),
    retry: false,
  })

  function handleCompare() {
    setEnabled(false)
    // Next tick enable to force re-fetch if params are the same
    setTimeout(() => setEnabled(true), 0)
  }

  const overlapPct = data?.overlap_percentage ?? 0
  const overlapColor =
    overlapPct >= 60
      ? 'text-red-600 dark:text-red-400'
      : overlapPct >= 30
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-green-600 dark:text-green-400'

  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Portfolio Overlap Analysis</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Scheme 1 — AMFI Code</label>
            <input
              type="text"
              placeholder="e.g. 119551"
              value={amfi1}
              onChange={e => { setAmfi1(e.target.value); setEnabled(false) }}
              className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Scheme 2 — AMFI Code</label>
            <input
              type="text"
              placeholder="e.g. 120503"
              value={amfi2}
              onChange={e => { setAmfi2(e.target.value); setEnabled(false) }}
              className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
            />
          </div>
          <button
            onClick={handleCompare}
            disabled={!amfi1.trim() || !amfi2.trim() || isLoading}
            className="btn-primary disabled:opacity-40"
          >
            {isLoading ? 'Comparing…' : 'Compare'}
          </button>
        </div>
      </div>

      {isError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700 dark:text-red-300">Failed to fetch overlap data. Check AMFI codes and try again.</p>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="card border border-gray-100 dark:border-gray-800 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">Overlap</p>
              <p className={`text-3xl font-bold mt-1 ${overlapColor}`}>
                {overlapPct.toFixed(1)}%
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-400 mt-0.5">
                {overlapPct >= 60 ? 'High overlap' : overlapPct >= 30 ? 'Moderate overlap' : 'Low overlap'}
              </p>
            </div>
            <div className="card border border-gray-100 dark:border-gray-800 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">Common Stocks</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{data.common_stocks}</p>
              <p className="text-xs text-gray-400 dark:text-gray-400 mt-0.5">shared holdings</p>
            </div>
            <div className="card border border-gray-100 dark:border-gray-800 col-span-2 sm:col-span-1">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Overlap Guide</p>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs text-gray-600 dark:text-gray-300">Below 30% — Good diversification</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-xs text-gray-600 dark:text-gray-300">30–60% — Moderate redundancy</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-xs text-gray-600 dark:text-gray-300">Above 60% — High redundancy</span>
                </div>
              </div>
            </div>
          </div>

          {/* Common holdings table */}
          {data.common_holdings?.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Common Holdings ({data.common_holdings.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                    <tr>
                      <th className="table-header">#</th>
                      <th className="table-header">Company</th>
                      <th className="table-header text-right">Scheme 1 Weight</th>
                      <th className="table-header text-right">Scheme 2 Weight</th>
                      <th className="table-header text-right">Avg Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.common_holdings.map((h, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="table-cell text-gray-400 dark:text-gray-400 tabular-nums">{i + 1}</td>
                        <td className="table-cell font-medium text-gray-900 dark:text-white max-w-[240px]">
                          <span className="block truncate" title={h.company_name}>{h.company_name}</span>
                        </td>
                        <td className="table-cell text-right tabular-nums text-gray-700 dark:text-gray-300">
                          {h.scheme_1_weight?.toFixed(2)}%
                        </td>
                        <td className="table-cell text-right tabular-nums text-gray-700 dark:text-gray-300">
                          {h.scheme_2_weight?.toFixed(2)}%
                        </td>
                        <td className="table-cell text-right tabular-nums text-gray-500 dark:text-gray-400">
                          {(((h.scheme_1_weight ?? 0) + (h.scheme_2_weight ?? 0)) / 2).toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

type Tab = 'holdings' | 'upload' | 'overlap'

export default function PortfolioPage() {
  const [tab, setTab] = useState<Tab>('holdings')

  return (
    <div className="p-6 space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {(
          [
            { id: 'holdings', label: 'Holdings Browser' },
            { id: 'upload',   label: 'Upload' },
            { id: 'overlap',  label: 'Overlap Analysis' },
          ] as { id: Tab; label: string }[]
        ).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.id
                ? 'border border-b-white border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 -mb-px'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'holdings' && <HoldingsBrowser />}
      {tab === 'upload'   && <UploadTab />}
      {tab === 'overlap'  && <OverlapTab />}
    </div>
  )
}
