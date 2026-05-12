import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, AlertCircle, CheckCircle, ChevronDown, ChevronUp, Edit2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useScheme } from '../hooks/useSchemes'
import { useSchemeSnapshot, useSchemeReturns } from '../hooks/useAnalytics'
import Spinner from '../components/ui/Spinner'
import NAVLineChart from '../components/charts/NAVLineChart'
import ReturnsBarChart from '../components/charts/ReturnsBarChart'
import { formatCrores, formatDate, formatNAV, formatPercent, formatReturn, returnColor } from '../utils/formatters'
import { RETURN_PERIODS } from '../config/constants'
import { format, subYears, subMonths } from 'date-fns'
import apiClient from '../api/client'

// ── helpers ────────────────────────────────────────────────────────────────

function formatCr(v?: number | null) {
  if (v == null) return '—'
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L Cr`
  if (v >= 1000)   return `₹${(v / 1000).toFixed(2)}K Cr`
  return `₹${v.toFixed(2)} Cr`
}

function formatRupees(v?: number | null) {
  if (v == null) return '—'
  return `₹${Number(v).toLocaleString('en-IN')}`
}

function quartileBadge(q?: number | null) {
  if (q == null) return null
  const map: Record<number, { label: string; cls: string }> = {
    1: { label: 'Q1', cls: 'bg-green-100 text-green-800' },
    2: { label: 'Q2', cls: 'bg-blue-100 text-blue-800' },
    3: { label: 'Q3', cls: 'bg-amber-100 text-amber-800' },
    4: { label: 'Q4', cls: 'bg-red-100 text-red-800' },
  }
  const entry = map[q]
  if (!entry) return null
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${entry.cls}`}>
      {entry.label}
    </span>
  )
}

// ── types ──────────────────────────────────────────────────────────────────

interface SchemeMeta {
  face_value?: number | null
  investment_objective?: string | null
  fund_manager_name?: string | null
  fund_manager_experience?: string | null
  alternate_benchmark?: string | null
  min_investment_amount?: number | null
  additional_investment_amount?: number | null
  sip_min_amount?: number | null
  dividend_frequency?: string | null
  maturity_type?: string | null
  exit_load?: string | null
  entry_load?: string | null
}

interface TopHolding {
  company_name: string
  sector?: string | null
  percentage_exposure?: number | null
  market_value_cr?: number | null
}

interface TopSector {
  sector: string
  percentage: number
}

interface TopHoldingsData {
  top_holdings: TopHolding[]
  top_sectors: TopSector[]
  avg_maturity_years?: number | null
  modified_duration?: number | null
  report_month?: string | null
}

// ── sub-components ─────────────────────────────────────────────────────────

function SchemeInfoPanel({ amfiCode, benchmarkName }: { amfiCode: string; benchmarkName?: string | null }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<SchemeMeta>({})
  const [editMsg, setEditMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const { data: meta, isLoading } = useQuery<SchemeMeta>({
    queryKey: ['scheme-meta', amfiCode],
    queryFn: () => apiClient.get(`/scheme-master/${amfiCode}`).then(r => r.data),
    enabled: !!amfiCode && open,
    retry: false,
    staleTime: 60 * 1000,
  })

  const patchMutation = useMutation({
    mutationFn: (payload: SchemeMeta) =>
      apiClient.patch(`/scheme-master/${amfiCode}`, payload).then(r => r.data),
    onSuccess: () => {
      setEditMsg({ type: 'success', text: 'Saved successfully.' })
      setEditing(false)
      qc.invalidateQueries({ queryKey: ['scheme-meta', amfiCode] })
      setTimeout(() => setEditMsg(null), 3000)
    },
    onError: (err: Error) => {
      setEditMsg({ type: 'error', text: err.message || 'Save failed.' })
    },
  })

  function openEdit() {
    setForm({
      face_value: meta?.face_value ?? null,
      investment_objective: meta?.investment_objective ?? null,
      fund_manager_name: meta?.fund_manager_name ?? null,
      fund_manager_experience: meta?.fund_manager_experience ?? null,
      alternate_benchmark: meta?.alternate_benchmark ?? null,
      min_investment_amount: meta?.min_investment_amount ?? null,
      additional_investment_amount: meta?.additional_investment_amount ?? null,
      sip_min_amount: meta?.sip_min_amount ?? null,
      dividend_frequency: meta?.dividend_frequency ?? null,
      maturity_type: meta?.maturity_type ?? null,
      exit_load: meta?.exit_load ?? null,
      entry_load: meta?.entry_load ?? null,
    })
    setEditMsg(null)
    setEditing(true)
  }

  const rows: { label: string; value: string | null | undefined }[] = meta
    ? [
        { label: 'Fund Manager', value: meta.fund_manager_name },
        { label: 'Experience', value: meta.fund_manager_experience },
        { label: 'Investment Objective', value: meta.investment_objective },
        { label: 'Benchmark', value: benchmarkName },
        { label: 'Alternate Benchmark', value: meta.alternate_benchmark },
        { label: 'Face Value', value: meta.face_value != null ? `₹${meta.face_value}` : null },
        { label: 'Dividend Frequency', value: meta.dividend_frequency },
        { label: 'Maturity Type', value: meta.maturity_type },
        { label: 'Min Investment', value: meta.min_investment_amount != null ? formatRupees(meta.min_investment_amount) : null },
        { label: 'Additional Investment', value: meta.additional_investment_amount != null ? formatRupees(meta.additional_investment_amount) : null },
        { label: 'SIP Min', value: meta.sip_min_amount != null ? formatRupees(meta.sip_min_amount) : null },
        { label: 'Exit Load', value: meta.exit_load },
        { label: 'Entry Load', value: meta.entry_load },
      ]
    : []

  const filledRows = rows.filter(r => r.value != null && r.value !== '')
  const allEmpty = meta != null && filledRows.length === 0

  return (
    <div className="card">
      <button
        className="w-full flex items-center justify-between"
        onClick={() => setOpen(o => !o)}
      >
        <h3 className="text-sm font-semibold text-gray-700">Scheme Info</h3>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {isLoading && <Spinner size="sm" />}

          {editMsg && (
            <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border ${
              editMsg.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              {editMsg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {editMsg.text}
            </div>
          )}

          {!editing && meta && (
            <>
              {allEmpty ? (
                <p className="text-xs text-gray-400 italic">
                  No additional details. Use Edit to add fund manager info.
                </p>
              ) : (
                <dl className="space-y-2">
                  {filledRows.map(r => (
                    <div key={r.label} className="flex gap-2">
                      <dt className="w-40 shrink-0 text-xs text-gray-500">{r.label}</dt>
                      <dd className="text-xs text-gray-900 font-medium">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <button
                onClick={openEdit}
                className="mt-2 flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                <Edit2 size={12} />
                Edit
              </button>
            </>
          )}

          {editing && (
            <form
              onSubmit={e => {
                e.preventDefault()
                patchMutation.mutate(form)
              }}
              className="space-y-3"
            >
              {(
                [
                  { key: 'fund_manager_name', label: 'Fund Manager', type: 'text' },
                  { key: 'fund_manager_experience', label: 'Experience', type: 'text' },
                  { key: 'investment_objective', label: 'Investment Objective', type: 'textarea' },
                  { key: 'alternate_benchmark', label: 'Alternate Benchmark', type: 'text' },
                  { key: 'face_value', label: 'Face Value (₹)', type: 'number' },
                  { key: 'dividend_frequency', label: 'Dividend Frequency', type: 'text' },
                  { key: 'maturity_type', label: 'Maturity Type', type: 'text' },
                  { key: 'min_investment_amount', label: 'Min Investment (₹)', type: 'number' },
                  { key: 'additional_investment_amount', label: 'Additional Investment (₹)', type: 'number' },
                  { key: 'sip_min_amount', label: 'SIP Min (₹)', type: 'number' },
                  { key: 'exit_load', label: 'Exit Load', type: 'text' },
                  { key: 'entry_load', label: 'Entry Load', type: 'text' },
                ] as { key: keyof SchemeMeta; label: string; type: string }[]
              ).map(({ key, label, type }) => (
                <div key={key}>
                  <label className="text-xs text-gray-500 block mb-1">{label}</label>
                  {type === 'textarea' ? (
                    <textarea
                      rows={3}
                      value={(form[key] as string) ?? ''}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value || null }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <input
                      type={type}
                      value={(form[key] as string | number) ?? ''}
                      onChange={e =>
                        setForm(f => ({
                          ...f,
                          [key]: type === 'number'
                            ? e.target.value === '' ? null : Number(e.target.value)
                            : e.target.value || null,
                        }))
                      }
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={patchMutation.isPending}
                  className="btn-primary text-xs py-1.5 px-4 disabled:opacity-40"
                >
                  {patchMutation.isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="btn-secondary text-xs py-1.5 px-4"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

// ── main page ──────────────────────────────────────────────────────────────

export default function SchemeDetailPage() {
  const { amfiCode } = useParams<{ amfiCode: string }>()
  const navigate = useNavigate()
  const { data: scheme, isLoading: schemeLoading } = useScheme(amfiCode!)
  const { data: snapshot, refetch: refetchSnapshot } = useSchemeSnapshot(amfiCode!)
  const fromDate = format(subYears(new Date(), 1), 'yyyy-MM-dd')
  const toDate = format(new Date(), 'yyyy-MM-dd')
  const { data: returns, isLoading: returnsLoading, refetch: refetchReturns } = useSchemeReturns(amfiCode!, fromDate, toDate)

  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Rolling returns
  const [rollingPeriod, setRollingPeriod] = useState(1)
  const { data: rollingData } = useQuery({
    queryKey: ['rolling-returns', amfiCode, rollingPeriod],
    queryFn: () =>
      apiClient
        .get(`/analytics/scheme/${amfiCode}/rolling-returns`, { params: { period_years: rollingPeriod } })
        .then(r => r.data),
    enabled: !!amfiCode,
    retry: false,
  })

  // Calendar year returns
  const { data: calendarData } = useQuery({
    queryKey: ['calendar-returns', amfiCode],
    queryFn: () =>
      apiClient.get(`/analytics/scheme/${amfiCode}/calendar-returns`).then(r => r.data),
    enabled: !!amfiCode,
    retry: false,
  })

  // Direct vs Regular comparison
  const { data: drData } = useQuery({
    queryKey: ['direct-regular', amfiCode],
    queryFn: () =>
      apiClient
        .get('/analytics/compare/direct-regular', { params: { amfi_code: amfiCode } })
        .then(r => r.data),
    enabled: !!amfiCode,
    retry: false,
  })

  // Dividend summary & history
  const { data: divSummary } = useQuery({
    queryKey: ['dividend-summary', amfiCode],
    queryFn: () => apiClient.get(`/dividends/${amfiCode}/summary`).then(r => r.data),
    enabled: !!amfiCode,
    retry: false,
  })
  const { data: divHistory } = useQuery({
    queryKey: ['dividend-history', amfiCode],
    queryFn: () =>
      apiClient.get(`/dividends/${amfiCode}`, { params: { page_size: 10 } }).then(r => r.data),
    enabled: !!amfiCode,
    retry: false,
  })

  // Top holdings
  const { data: topHoldings } = useQuery<TopHoldingsData>({
    queryKey: ['top-holdings', amfiCode],
    queryFn: () => apiClient.get(`/portfolio/top-holdings/${amfiCode}`).then(r => r.data),
    enabled: !!amfiCode,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const hasNav = !!snapshot?.latest_nav
  const hasHistory = (returns?.nav_history?.length ?? 0) > 0
  const needsData = !hasNav || !hasHistory

  async function handleSyncNav() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      await apiClient.post('/nav/sync')

      const histFrom = format(subMonths(new Date(), 13), 'yyyy-MM-dd')
      const histTo = format(new Date(), 'yyyy-MM-dd')
      await apiClient.post('/nav/historical/fetch-range', null, {
        params: { from_date: histFrom, to_date: histTo },
      })

      await apiClient.post('/analytics/refresh-snapshots')

      setSyncMsg({ type: 'success', text: 'NAV data synced — refreshing...' })
      setTimeout(() => {
        refetchSnapshot()
        refetchReturns()
        setSyncMsg(null)
      }, 1500)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sync failed'
      setSyncMsg({ type: 'error', text: msg })
    } finally {
      setSyncing(false)
    }
  }

  if (schemeLoading) return <Spinner />
  if (!scheme) return <div className="p-6 text-gray-500">Scheme not found</div>

  const hasSipReturns =
    snapshot?.sip_return_1y != null ||
    snapshot?.sip_return_3y != null ||
    snapshot?.sip_return_5y != null

  const hasTopHoldings = (topHoldings?.top_holdings?.length ?? 0) > 0
  const hasTopSectors = (topHoldings?.top_sectors?.length ?? 0) > 0
  const hasDurationMetrics =
    topHoldings?.avg_maturity_years != null || topHoldings?.modified_duration != null

  const hasExpandedRisk =
    snapshot != null &&
    (snapshot.sharpe_ratio != null || snapshot.max_drawdown != null)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/schemes')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900">{scheme.scheme_name}</h2>
          <div className="flex gap-3 mt-1 flex-wrap">
            <span className="text-sm text-gray-500">{scheme.amc_name}</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">AMFI: {scheme.amfi_code}</span>
            {scheme.isin_div_payout_growth && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">ISIN: {scheme.isin_div_payout_growth}</span>
            )}
          </div>
          {scheme.scheme_category && (
            <span className="inline-block mt-2 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-md font-medium">
              {scheme.scheme_category}
            </span>
          )}
        </div>
      </div>

      {/* No-data banner with sync button */}
      {needsData && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertCircle size={16} className="shrink-0" />
            <span className="text-sm">
              {!hasNav
                ? 'No NAV data yet. Sync to fetch latest NAV and 1-year history from AMFI.'
                : 'NAV history missing. Sync to fetch 1-year data for the chart.'}
            </span>
          </div>
          <button
            onClick={handleSyncNav}
            disabled={syncing}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 transition-colors"
          >
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync NAV Data'}
          </button>
        </div>
      )}

      {/* Sync feedback */}
      {syncMsg && (
        <div className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg border ${
          syncMsg.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {syncMsg.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          {syncMsg.text}
        </div>
      )}

      {/* Snapshot KPIs — row 1: core 4 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Latest NAV', value: snapshot?.latest_nav ? formatNAV(snapshot.latest_nav) : '—', sub: snapshot?.nav_date ? formatDate(snapshot.nav_date) : 'No data yet' },
          { label: 'AUM', value: snapshot?.aum_cr ? formatCrores(snapshot.aum_cr) : '—', sub: 'Assets under management' },
          { label: 'Expense Ratio', value: snapshot?.expense_ratio ? formatPercent(snapshot.expense_ratio) : '—', sub: 'Total expense ratio' },
          { label: '1Y Return', value: snapshot?.return_1y != null ? formatReturn(snapshot.return_1y) : '—', sub: 'Annualized', color: snapshot?.return_1y != null ? returnColor(snapshot.return_1y) : 'text-gray-400' },
          { label: '52W High', value: snapshot?.nav_52w_high != null ? formatNAV(snapshot.nav_52w_high) : '—', sub: '52-week high NAV' },
          { label: '52W Low',  value: snapshot?.nav_52w_low  != null ? formatNAV(snapshot.nav_52w_low)  : '—', sub: '52-week low NAV' },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="card border border-gray-100">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-xl font-bold mt-1 ${color || 'text-gray-900'}`}>{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* NAV Chart + Returns + SIP Returns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">NAV History (1 Year)</h3>
          {returnsLoading ? (
            <Spinner size="sm" />
          ) : hasHistory ? (
            <NAVLineChart data={returns!.nav_history} schemeName={scheme.scheme_name} />
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
              <p className="text-sm text-gray-400">No NAV history in database</p>
              <p className="text-xs text-gray-300">Use the "Sync NAV Data" button above to fetch 1-year data</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Returns Summary */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Returns Summary</h3>
            {snapshot && (snapshot.return_1w != null || snapshot.return_1m != null || snapshot.return_1y != null) ? (
              <>
                <ReturnsBarChart snapshot={snapshot} />
                <div className="mt-4 space-y-2">
                  {RETURN_PERIODS.map(({ key, label }) => {
                    const val = snapshot[key as keyof typeof snapshot] as number | null
                    return val != null ? (
                      <div key={key} className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">{label}</span>
                        <span className={`text-sm font-medium ${returnColor(val)}`}>{formatReturn(val)}</span>
                      </div>
                    ) : null
                  })}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center gap-1">
                <p className="text-sm text-gray-400">No returns data</p>
                <p className="text-xs text-gray-300">Computed after NAV history is loaded</p>
              </div>
            )}
          </div>

          {/* SIP Returns */}
          {hasSipReturns && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">SIP Returns</h3>
              <div className="space-y-2">
                {[
                  { label: '1Y SIP', key: 'sip_return_1y' },
                  { label: '3Y SIP', key: 'sip_return_3y' },
                  { label: '5Y SIP', key: 'sip_return_5y' },
                ].map(({ label, key }) => {
                  const val = snapshot?.[key as keyof typeof snapshot] as number | null | undefined
                  return val != null ? (
                    <div key={key} className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">{label}</span>
                      <span className={`text-sm font-medium ${returnColor(val)}`}>{formatReturn(val)}</span>
                    </div>
                  ) : null
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2b. Rolling Returns */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Rolling Returns</h3>
          <div className="flex gap-1">
            {[1, 3, 5].map(p => (
              <button
                key={p}
                onClick={() => setRollingPeriod(p)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  rollingPeriod === p
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p}Y
              </button>
            ))}
          </div>
        </div>

        {rollingData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
            {[
              { label: 'Min', value: rollingData.min, color: 'text-red-600' },
              { label: 'Max', value: rollingData.max, color: 'text-green-600' },
              { label: 'Mean', value: rollingData.mean, color: 'text-blue-600' },
              { label: 'Median', value: rollingData.median, color: 'text-purple-600' },
              { label: 'Positive %', value: rollingData.positive_pct, suffix: '%', color: 'text-green-700' },
              { label: '>8% Periods', value: rollingData.gt_8_pct, suffix: '%', color: 'text-blue-700' },
              { label: '>12% Periods', value: rollingData.gt_12_pct, suffix: '%', color: 'text-indigo-700' },
            ].map(({ label, value, color, suffix }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className={`text-sm font-bold ${color}`}>
                  {value != null ? `${value.toFixed(1)}${suffix ?? '%'}` : '—'}
                </p>
              </div>
            ))}
          </div>
        )}

        {rollingData?.series?.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={rollingData.series} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="rollingGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(0, 7)} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(2)}%`, 'Return']} labelFormatter={l => `Date: ${l}`} />
              <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="return" stroke="#3b82f6" fill="url(#rollingGrad)" dot={false} strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-xs text-gray-400 italic text-center py-6">No rolling return data available for this period.</p>
        )}
      </div>

      {/* 2c. Calendar Year Returns */}
      {calendarData?.years?.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Calendar Year Returns</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={calendarData.years} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(2)}%`, 'Return']} />
              <ReferenceLine y={0} stroke="#9ca3af" />
              <Bar dataKey="return" radius={[3, 3, 0, 0]}>
                {calendarData.years.map((entry: { year: number; return: number }, idx: number) => (
                  <Cell key={idx} fill={entry.return >= 0 ? '#22c55e' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 2a. Expanded Risk Metrics */}
      {hasExpandedRisk && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Risk Metrics</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {snapshot?.sharpe_ratio != null && (
              <div>
                <p className="text-xs text-gray-500">Sharpe Ratio</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{snapshot.sharpe_ratio.toFixed(2)}</p>
              </div>
            )}
            {snapshot?.beta != null && (
              <div>
                <p className="text-xs text-gray-500">Beta</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{snapshot.beta.toFixed(2)}</p>
              </div>
            )}
            {snapshot?.std_deviation != null && (
              <div>
                <p className="text-xs text-gray-500">Std Deviation</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{formatPercent(snapshot.std_deviation)}</p>
              </div>
            )}
            {snapshot?.max_drawdown != null && (
              <div>
                <p className="text-xs text-gray-500">Max Drawdown (3Y)</p>
                <p className={`text-lg font-bold mt-1 ${
                  snapshot.max_drawdown > 20
                    ? 'text-red-600'
                    : snapshot.max_drawdown > 10
                    ? 'text-amber-600'
                    : 'text-gray-900'
                }`}>
                  {snapshot.max_drawdown.toFixed(2)}%
                </p>
              </div>
            )}
            {snapshot?.sortino_ratio != null && (
              <div>
                <p className="text-xs text-gray-500">Sortino Ratio</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{snapshot.sortino_ratio.toFixed(2)}</p>
              </div>
            )}
            {snapshot?.calmar_ratio != null && (
              <div>
                <p className="text-xs text-gray-500">Calmar Ratio</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{snapshot.calmar_ratio.toFixed(2)}</p>
              </div>
            )}
            {snapshot?.var_95 != null && (
              <div>
                <p className="text-xs text-gray-500">VaR (95%, 1-day)</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{snapshot.var_95.toFixed(2)}%</p>
              </div>
            )}
            {snapshot?.category_rank != null && (
              <div>
                <p className="text-xs text-gray-500">Category Rank</p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-lg font-bold text-gray-900">
                    {snapshot.category_rank}
                    {snapshot.category_count != null && (
                      <span className="text-sm font-normal text-gray-400"> / {snapshot.category_count}</span>
                    )}
                  </p>
                  {quartileBadge(snapshot.category_quartile)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tracking Info + optional duration metrics */}
      {snapshot && (snapshot.tracking_error_1y != null || snapshot.tracking_diff_latest != null || hasDurationMetrics) && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Index Fund Metrics</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {snapshot?.tracking_error_1y != null && (
              <div>
                <p className="text-xs text-gray-500">Tracking Error (1Y)</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{formatPercent(snapshot.tracking_error_1y)}</p>
              </div>
            )}
            {snapshot?.tracking_diff_latest != null && (
              <div>
                <p className="text-xs text-gray-500">Tracking Difference (Latest)</p>
                <p className={`text-lg font-bold mt-1 ${returnColor(-(snapshot.tracking_diff_latest || 0))}`}>
                  {formatPercent(snapshot.tracking_diff_latest)}
                </p>
              </div>
            )}
            {topHoldings?.avg_maturity_years != null && (
              <div>
                <p className="text-xs text-gray-500">Avg Maturity</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{topHoldings.avg_maturity_years.toFixed(2)} yrs</p>
              </div>
            )}
            {topHoldings?.modified_duration != null && (
              <div>
                <p className="text-xs text-gray-500">Modified Duration</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{topHoldings.modified_duration.toFixed(2)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2d. Direct vs Regular Comparison */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Direct vs Regular Comparison</h3>
        {drData?.available ? (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs text-gray-500 pb-2 pr-4 font-medium">Metric</th>
                    <th className="text-right text-xs text-gray-500 pb-2 px-4 font-medium">Direct</th>
                    <th className="text-right text-xs text-gray-500 pb-2 pl-4 font-medium">Regular</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[
                    { label: 'Expense Ratio', directVal: drData.direct?.expense_ratio, regVal: drData.regular?.expense_ratio, fmt: (v: number) => `${v.toFixed(2)}%`, lowerBetter: true },
                    { label: '1Y Return', directVal: drData.direct?.return_1y, regVal: drData.regular?.return_1y, fmt: (v: number) => `${v.toFixed(2)}%`, lowerBetter: false },
                    { label: '3Y Return', directVal: drData.direct?.return_3y, regVal: drData.regular?.return_3y, fmt: (v: number) => `${v.toFixed(2)}%`, lowerBetter: false },
                    { label: '5Y Return', directVal: drData.direct?.return_5y, regVal: drData.regular?.return_5y, fmt: (v: number) => `${v.toFixed(2)}%`, lowerBetter: false },
                  ].map(({ label, directVal, regVal, fmt, lowerBetter }) => {
                    const directBetter = directVal != null && regVal != null &&
                      (lowerBetter ? directVal < regVal : directVal > regVal)
                    return (
                      <tr key={label}>
                        <td className="py-2 pr-4 text-xs text-gray-600">{label}</td>
                        <td className={`py-2 px-4 text-right text-xs font-semibold ${directBetter ? 'text-green-600' : 'text-gray-800'}`}>
                          {directVal != null ? fmt(directVal) : '—'}
                        </td>
                        <td className="py-2 pl-4 text-right text-xs text-gray-600">
                          {regVal != null ? fmt(regVal) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-green-800">Savings from Direct Plan</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                {drData.expense_gap != null && (
                  <div>
                    <p className="text-xs text-green-700">Expense Gap</p>
                    <p className="text-sm font-bold text-green-900">{drData.expense_gap.toFixed(2)}%</p>
                  </div>
                )}
                {drData.return_gap_1y != null && (
                  <div>
                    <p className="text-xs text-green-700">Return Gap (1Y)</p>
                    <p className="text-sm font-bold text-green-900">{drData.return_gap_1y.toFixed(2)}%</p>
                  </div>
                )}
                {drData.compounding_impact_10y_per_lakh != null && (
                  <div>
                    <p className="text-xs text-green-700">10Y Compounding Impact (per ₹1L)</p>
                    <p className="text-sm font-bold text-green-900">
                      ₹{drData.compounding_impact_10y_per_lakh.toLocaleString('en-IN')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500 italic">No paired Direct/Regular plan found.</p>
          </div>
        )}
      </div>

      {/* Top Holdings */}
      {hasTopHoldings && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">
              Top Holdings
              {topHoldings?.report_month && (
                <span className="ml-2 text-xs font-normal text-gray-400">({topHoldings.report_month})</span>
              )}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-header">#</th>
                  <th className="table-header">Company</th>
                  <th className="table-header">Sector</th>
                  <th className="table-header text-right">% Exposure</th>
                  <th className="table-header text-right">Market Value</th>
                </tr>
              </thead>
              <tbody>
                {topHoldings!.top_holdings.slice(0, 10).map((h, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="table-cell text-gray-400 tabular-nums">{i + 1}</td>
                    <td className="table-cell font-medium text-gray-900 max-w-[220px]">
                      <span className="block truncate" title={h.company_name}>{h.company_name}</span>
                    </td>
                    <td className="table-cell text-gray-500 text-xs">{h.sector || '—'}</td>
                    <td className="table-cell text-right text-gray-800 tabular-nums">
                      {h.percentage_exposure != null ? `${h.percentage_exposure.toFixed(2)}%` : '—'}
                    </td>
                    <td className="table-cell text-right text-gray-800 tabular-nums">
                      {formatCr(h.market_value_cr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Sectors */}
      {hasTopSectors && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Top Sectors</h3>
          <div className="space-y-2">
            {topHoldings!.top_sectors.map((s) => (
              <div key={s.sector} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-xs text-gray-600 truncate" title={s.sector}>{s.sector}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${Math.min(100, s.percentage)}%` }}
                  />
                </div>
                <span className="w-12 text-right text-xs text-gray-700 tabular-nums">{s.percentage.toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2e. Dividend / IDCW History */}
      {divSummary?.total_dividends_declared > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Dividend / IDCW History</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            {[
              { label: 'Total Declared', value: divSummary.total_dividends_declared },
              { label: 'Cumulative 1Y (₹/unit)', value: divSummary.cumulative_1y },
              { label: 'Cumulative 3Y (₹/unit)', value: divSummary.cumulative_3y },
              { label: 'Cumulative 5Y (₹/unit)', value: divSummary.cumulative_5y },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-base font-bold text-gray-900 mt-1">
                  {value != null ? value.toFixed(4) : '—'}
                </p>
              </div>
            ))}
          </div>
          {divHistory?.items?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-header">Record Date</th>
                    <th className="table-header text-right">₹/Unit</th>
                    <th className="table-header text-right">NAV on Date</th>
                    <th className="table-header text-right">Yield %</th>
                    <th className="table-header">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {divHistory.items.map((d: {
                    record_date: string
                    dividend_per_unit: number
                    nav_on_record_date: number
                    dividend_yield: number
                    dividend_type: string
                  }, i: number) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="table-cell tabular-nums">{d.record_date}</td>
                      <td className="table-cell text-right tabular-nums font-medium text-green-700">
                        ₹{d.dividend_per_unit?.toFixed(4)}
                      </td>
                      <td className="table-cell text-right tabular-nums text-gray-600">
                        {d.nav_on_record_date != null ? `₹${d.nav_on_record_date.toFixed(4)}` : '—'}
                      </td>
                      <td className="table-cell text-right tabular-nums text-gray-600">
                        {d.dividend_yield != null ? `${d.dividend_yield.toFixed(2)}%` : '—'}
                      </td>
                      <td className="table-cell text-gray-500">{d.dividend_type || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Scheme Info (collapsible) */}
      <SchemeInfoPanel
        amfiCode={amfiCode!}
        benchmarkName={(snapshot as unknown as { benchmark_name?: string })?.benchmark_name}
      />
    </div>
  )
}
