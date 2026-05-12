import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Upload, RefreshCw, TrendingUp, TrendingDown, CheckCircle, AlertCircle } from 'lucide-react'
import apiClient from '../api/client'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import Badge from '../components/ui/Badge'

// ── types ─────────────────────────────────────────────────────────────────────

interface NpsScheme {
  scheme_code: string
  pfm_code: string
  scheme_name: string
  asset_class: string
  tier: string
  variant: string
  category: string
  is_apy: number
  is_active: number
}

interface NpsSnapshot {
  scheme_code: string
  pfm_code: string
  pfm_name: string
  scheme_name: string
  asset_class: string
  tier: string
  variant: string
  category: string
  is_apy: number
  latest_nav: number | null
  nav_date: string | null
  return_1y: number | null
  return_3y: number | null
  return_5y: number | null
  return_max: number | null
  sharpe_ratio: number | null
  sortino_ratio: number | null
  max_drawdown: number | null
  volatility_1y: number | null
  category_rank: number | null
  category_count: number | null
  snapshot_refreshed_at: string | null
}

interface NpsPfm {
  pfm_code: string
  pfm_name: string
}

interface UploadResult {
  records: number
  inserted: number
  skipped?: number
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtReturn(v: number | null) {
  if (v == null) return <span className="text-gray-300">—</span>
  const pos = v >= 0
  return (
    <span className={`flex items-center gap-0.5 font-semibold text-xs ${pos ? 'text-green-600' : 'text-red-500'}`}>
      {pos ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {pos ? '+' : ''}{v.toFixed(2)}%
    </span>
  )
}

function assetColor(ac: string) {
  const map: Record<string, string> = {
    E: 'bg-purple-100 text-purple-700',
    C: 'bg-blue-100 text-blue-700',
    G: 'bg-green-100 text-green-700',
    A: 'bg-orange-100 text-orange-700',
  }
  return map[ac] ?? 'bg-gray-100 text-gray-500'
}

const PFM_SHORT: Record<string, string> = {
  PFM001: 'SBI', PFM002: 'UTI', PFM003: 'LIC', PFM005: 'Kotak',
  PFM007: 'ICICI', PFM008: 'HDFC', PFM010: 'Aditya Birla',
  PFM011: 'Tata', PFM013: 'Axis', PFM014: 'DSP',
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function NPSPage() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'analytics' | 'schemes' | 'upload'>('analytics')

  // analytics filters
  const [pfmCode, setPfmCode]       = useState('')
  const [assetClass, setAssetClass] = useState('')
  const [tier, setTier]             = useState('')
  const [category, setCategory]     = useState('')
  const [isApy, setIsApy]           = useState('')
  const [search, setSearch]         = useState('')

  // upload state
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [uploadError, setUploadError]   = useState<string | null>(null)

  const tabs = [
    { key: 'analytics', label: 'Analytics Snapshots' },
    { key: 'schemes',   label: 'Scheme Master' },
    { key: 'upload',    label: 'Upload NAV ZIP' },
  ] as const

  // ── queries ──────────────────────────────────────────────────────────────

  const { data: pfms } = useQuery<NpsPfm[]>({
    queryKey: ['nps-pfms'],
    queryFn: () => apiClient.get('/nps/pfms').then(r => r.data),
  })

  const { data: snapshots, isLoading: snapLoading } = useQuery<NpsSnapshot[]>({
    queryKey: ['nps-snapshots', pfmCode, assetClass, tier, category, isApy],
    queryFn: () => {
      const params: Record<string, string> = { page_size: '1000' }
      if (pfmCode)    params.pfm_code    = pfmCode
      if (assetClass) params.asset_class = assetClass
      if (tier)       params.tier        = tier
      if (category)   params.category    = category
      if (isApy)      params.is_apy      = isApy
      return apiClient.get('/nps/analytics/snapshots', { params }).then(r => r.data)
    },
    enabled: activeTab === 'analytics',
  })

  const { data: schemes, isLoading: schemesLoading } = useQuery<NpsScheme[]>({
    queryKey: ['nps-schemes', pfmCode, assetClass, tier, category, isApy],
    queryFn: () => {
      const params: Record<string, string> = {}
      if (pfmCode)    params.pfm_code    = pfmCode
      if (assetClass) params.asset_class = assetClass
      if (tier)       params.tier        = tier
      if (category)   params.category    = category
      if (isApy)      params.is_apy      = isApy
      return apiClient.get('/nps/schemes', { params }).then(r => r.data)
    },
    enabled: activeTab === 'schemes',
  })

  // ── mutations ─────────────────────────────────────────────────────────────

  const refreshMutation = useMutation({
    mutationFn: () => apiClient.post('/nps/analytics/refresh').then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nps-snapshots'] }),
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return apiClient.post('/nps/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
    },
    onSuccess: (data) => { setUploadResult(data); setUploadError(null) },
    onError: (e: Error) => { setUploadError(e.message); setUploadResult(null) },
  })

  const handleUpload = () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setUploadResult(null)
    setUploadError(null)
    uploadMutation.mutate(file)
  }

  // ── filtered snapshots ────────────────────────────────────────────────────

  const visibleSnaps = (snapshots ?? []).filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.scheme_name.toLowerCase().includes(q) || (PFM_SHORT[s.pfm_code] ?? '').toLowerCase().includes(q)
  })

  const visibleSchemes = (schemes ?? []).filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.scheme_name.toLowerCase().includes(q)
  })

  const uniqueCategories = [...new Set((snapshots ?? []).map(s => s.category).filter(Boolean))].sort()

  return (
    <div className="p-6 space-y-4">

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); setSearch('') }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'analytics' && (
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <RefreshCw size={14} className={refreshMutation.isPending ? 'animate-spin' : ''} />
            {refreshMutation.isPending ? 'Refreshing…' : 'Refresh All Analytics'}
          </button>
        )}
      </div>

      {/* ── Refresh result banner ─────────────────────────────────────────── */}
      {refreshMutation.isSuccess && (
        <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          <CheckCircle size={15} />
          Refreshed {(refreshMutation.data as any)?.refreshed ?? '?'} schemes
          {(refreshMutation.data as any)?.errors > 0 && ` · ${(refreshMutation.data as any).errors} errors`}
        </div>
      )}

      {/* ── Filters (shared) ─────────────────────────────────────────────── */}
      {activeTab !== 'upload' && (
        <div className="card">
          <div className="flex flex-wrap gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search scheme name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {/* PFM */}
            <select
              value={pfmCode}
              onChange={e => setPfmCode(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All PFMs</option>
              {(pfms ?? []).map(p => (
                <option key={p.pfm_code} value={p.pfm_code}>
                  {PFM_SHORT[p.pfm_code] ?? p.pfm_code}
                </option>
              ))}
            </select>
            {/* Asset class */}
            <select
              value={assetClass}
              onChange={e => setAssetClass(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Assets</option>
              <option value="E">Equity (E)</option>
              <option value="C">Corp Bond (C)</option>
              <option value="G">Govt Sec (G)</option>
              <option value="A">Alternate (A)</option>
            </select>
            {/* Tier */}
            <select
              value={tier}
              onChange={e => setTier(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Tiers</option>
              <option value="I">Tier I</option>
              <option value="II">Tier II</option>
            </select>
            {/* Category */}
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {/* APY toggle */}
            <select
              value={isApy}
              onChange={e => setIsApy(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">NPS + APY</option>
              <option value="true">APY Only</option>
              <option value="false">NPS Only</option>
            </select>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {activeTab === 'analytics' ? visibleSnaps.length : visibleSchemes.length} records shown
          </p>
        </div>
      )}

      {/* ── Analytics Snapshots tab ──────────────────────────────────────── */}
      {activeTab === 'analytics' && (
        <div className="card p-0 overflow-hidden">
          {snapLoading ? <Spinner /> : visibleSnaps.length === 0 ? <EmptyState /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-header">Scheme</th>
                    <th className="table-header">PFM</th>
                    <th className="table-header text-center">Asset</th>
                    <th className="table-header text-center">Tier</th>
                    <th className="table-header text-right">NAV</th>
                    <th className="table-header text-right">1Y</th>
                    <th className="table-header text-right">3Y</th>
                    <th className="table-header text-right">5Y</th>
                    <th className="table-header text-right">Sharpe</th>
                    <th className="table-header text-right">Max DD</th>
                    <th className="table-header text-center">Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSnaps.map(s => (
                    <tr key={s.scheme_code} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="table-cell max-w-[220px]">
                        <span className="block truncate font-medium text-gray-900 text-xs" title={s.scheme_name}>
                          {s.scheme_name}
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono">{s.scheme_code}</span>
                        {s.is_apy === 1 && (
                          <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-600">APY</span>
                        )}
                      </td>
                      <td className="table-cell text-xs text-gray-500">{PFM_SHORT[s.pfm_code] ?? s.pfm_code}</td>
                      <td className="table-cell text-center">
                        {s.asset_class && s.asset_class !== 'NA' && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${assetColor(s.asset_class)}`}>
                            {s.asset_class}
                          </span>
                        )}
                      </td>
                      <td className="table-cell text-center text-xs text-gray-500">
                        {s.tier && s.tier !== 'NA' ? `T${s.tier}` : '—'}
                      </td>
                      <td className="table-cell text-right font-mono text-xs">
                        {s.latest_nav != null ? `₹${Number(s.latest_nav).toFixed(4)}` : '—'}
                      </td>
                      <td className="table-cell text-right">{fmtReturn(s.return_1y)}</td>
                      <td className="table-cell text-right">{fmtReturn(s.return_3y)}</td>
                      <td className="table-cell text-right">{fmtReturn(s.return_5y)}</td>
                      <td className="table-cell text-right text-xs font-semibold text-gray-700">
                        {s.sharpe_ratio != null ? Number(s.sharpe_ratio).toFixed(2) : '—'}
                      </td>
                      <td className="table-cell text-right text-xs font-semibold text-red-500">
                        {s.max_drawdown != null ? `-${Number(s.max_drawdown).toFixed(2)}%` : '—'}
                      </td>
                      <td className="table-cell text-center text-xs text-gray-500">
                        {s.category_rank != null && s.category_count != null
                          ? `#${s.category_rank}/${s.category_count}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Scheme Master tab ────────────────────────────────────────────── */}
      {activeTab === 'schemes' && (
        <div className="card p-0 overflow-hidden">
          {schemesLoading ? <Spinner /> : visibleSchemes.length === 0 ? <EmptyState /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-header">Scheme Code</th>
                    <th className="table-header">Scheme Name</th>
                    <th className="table-header">PFM</th>
                    <th className="table-header text-center">Asset</th>
                    <th className="table-header text-center">Tier</th>
                    <th className="table-header">Category</th>
                    <th className="table-header">Variant</th>
                    <th className="table-header text-center">APY</th>
                    <th className="table-header text-center">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSchemes.map(s => (
                    <tr key={s.scheme_code} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="table-cell font-mono text-blue-600 text-xs">{s.scheme_code}</td>
                      <td className="table-cell max-w-[260px]">
                        <span className="block truncate text-gray-900 font-medium text-xs" title={s.scheme_name}>
                          {s.scheme_name}
                        </span>
                      </td>
                      <td className="table-cell text-xs text-gray-500">{PFM_SHORT[s.pfm_code] ?? s.pfm_code}</td>
                      <td className="table-cell text-center">
                        {s.asset_class && s.asset_class !== 'NA' && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${assetColor(s.asset_class)}`}>
                            {s.asset_class}
                          </span>
                        )}
                      </td>
                      <td className="table-cell text-center text-xs text-gray-500">
                        {s.tier && s.tier !== 'NA' ? `T${s.tier}` : '—'}
                      </td>
                      <td className="table-cell text-xs text-gray-400 max-w-[140px]">
                        <span className="block truncate">{s.category}</span>
                      </td>
                      <td className="table-cell text-xs text-gray-400">{s.variant || '—'}</td>
                      <td className="table-cell text-center">
                        {s.is_apy === 1
                          ? <Badge label="APY" variant="yellow" />
                          : <Badge label="NPS" variant="blue" />}
                      </td>
                      <td className="table-cell text-center">
                        <Badge label={s.is_active === 1 ? 'Active' : 'Inactive'} variant={s.is_active === 1 ? 'green' : 'gray'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Upload tab ───────────────────────────────────────────────────── */}
      {activeTab === 'upload' && (
        <div className="card max-w-lg space-y-5">
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">Upload Daily NAV ZIP</h3>
            <p className="text-sm text-gray-500">
              Upload a single <code className="bg-gray-100 px-1 rounded text-xs">NAV_File_DDMMYYYY.zip</code> file
              from the NPS Trust website.
            </p>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Select ZIP file</span>
              <input
                ref={fileRef}
                type="file"
                accept=".zip"
                className="mt-1 block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0
                  file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100"
              />
            </label>
            <button
              onClick={handleUpload}
              disabled={uploadMutation.isPending}
              className="btn-primary flex items-center gap-2"
            >
              <Upload size={15} className={uploadMutation.isPending ? 'animate-bounce' : ''} />
              {uploadMutation.isPending ? 'Uploading…' : 'Upload & Ingest'}
            </button>
          </div>

          {/* Result */}
          {uploadResult && (
            <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle size={16} className="text-green-600 mt-0.5 shrink-0" />
              <div className="text-sm text-green-700">
                <p className="font-semibold">Upload successful</p>
                <p className="text-xs mt-0.5">
                  {uploadResult.records} records parsed · {uploadResult.inserted} inserted
                  {uploadResult.skipped != null ? ` · ${uploadResult.skipped} skipped` : ''}
                </p>
              </div>
            </div>
          )}
          {uploadError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
              <div className="text-sm text-red-600">
                <p className="font-semibold">Upload failed</p>
                <p className="text-xs mt-0.5">{uploadError}</p>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
