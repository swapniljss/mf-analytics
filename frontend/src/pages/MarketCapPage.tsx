import { useState } from 'react'
import { Upload, Search, CheckCircle, AlertCircle } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import apiClient from '../api/client'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import Badge from '../components/ui/Badge'
import { formatDate } from '../utils/formatters'

function formatCr(v?: number | null) {
  if (v == null) return '—'
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L Cr`
  if (v >= 1000)   return `₹${(v / 1000).toFixed(2)}K Cr`
  return `₹${v.toFixed(2)} Cr`
}

export default function MarketCapPage() {
  const [searchInput, setSearchInput] = useState('')
  const [bucket, setBucket] = useState('')
  const [page, setPage] = useState(1)
  const search = useDebouncedValue(searchInput, 300)
  const [file, setFile] = useState<File | null>(null)
  const [overrideDate, setOverrideDate] = useState('')   // optional override
  const [uploadResult, setUploadResult] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['market-cap-rows', search, bucket, page],
    queryFn: () =>
      apiClient
        .get('/market-cap/rows', {
          params: { search: search || undefined, bucket: bucket || undefined, page, page_size: 100 },
        })
        .then((r) => r.data),
    retry: false,
  })

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Please select an Excel file')
      const form = new FormData()
      form.append('file', file)
      if (overrideDate) form.append('effective_date', overrideDate)
      const { data } = await apiClient.post('/market-cap/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onSuccess: (data) => {
      setUploadResult(data.message || 'Upload successful')
      setUploadError(null)
      setFile(null)
      refetch()
    },
    onError: (err: Error) => {
      setUploadError(err.message)
      setUploadResult(null)
    },
  })

  const bucketColor = (b?: string) => {
    if (b === 'Large Cap') return 'blue'
    if (b === 'Mid Cap')   return 'green'
    if (b === 'Small Cap') return 'yellow'
    return 'gray'
  }

  return (
    <div className="p-6 space-y-4">
      {/* Upload card */}
      <div className="card space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Upload Market Cap Categorization</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Source: <span className="font-mono">AverageMarketCapitalizationDDMmmYYYY.xlsx</span> from
            AMFI (quarterly, ~5,000 companies). The effective date is read automatically from the
            file title row — no need to enter it manually.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[260px]">
            <label className="text-xs text-gray-500 block mb-1">
              Excel File <span className="text-gray-400">(.xlsx)</span>
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null)
                setUploadResult(null)
                setUploadError(null)
              }}
              className="block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700
                         file:mr-3 file:py-1 file:px-3 file:rounded file:border-0
                         file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700
                         hover:file:bg-blue-100"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">
              Override Date <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="date"
              value={overrideDate}
              onChange={(e) => setOverrideDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => uploadMutation.mutate()}
            disabled={!file || uploadMutation.isPending}
            className="btn-primary flex items-center gap-2 disabled:opacity-40"
          >
            <Upload size={14} />
            {uploadMutation.isPending ? 'Processing…' : 'Upload & Parse'}
          </button>
        </div>

        {/* Upload result feedback */}
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
      </div>

      {/* Filters + Table */}
      <div className="card p-0 overflow-hidden">
        <div className="flex flex-wrap gap-3 p-4 border-b border-gray-100">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search company name…"
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={bucket}
            onChange={(e) => { setBucket(e.target.value); setPage(1) }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Buckets</option>
            <option value="Large Cap">Large Cap (Top 100)</option>
            <option value="Mid Cap">Mid Cap (101–250)</option>
            <option value="Small Cap">Small Cap (251+)</option>
          </select>
          {data?.total != null && (
            <span className="self-center text-xs text-gray-400">{data.total.toLocaleString('en-IN')} companies</span>
          )}
        </div>

        {isLoading ? (
          <Spinner />
        ) : !data?.items?.length ? (
          <EmptyState message="No market cap data — upload a quarterly file from AMFI" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-header w-12">#</th>
                  <th className="table-header">Company</th>
                  <th className="table-header">ISIN</th>
                  <th className="table-header">BSE</th>
                  <th className="table-header">NSE</th>
                  <th className="table-header text-right">Avg Market Cap</th>
                  <th className="table-header">Bucket</th>
                  <th className="table-header">As of</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r: {
                  id: number; rank_number?: number; company_name: string; isin?: string;
                  bse_symbol?: string; nse_symbol?: string; avg_market_cap_cr?: number;
                  market_cap_bucket?: string; effective_date?: string;
                }) => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="table-cell text-gray-400 tabular-nums">{r.rank_number}</td>
                    <td className="table-cell max-w-[240px]">
                      <span className="block truncate font-medium text-gray-900" title={r.company_name}>
                        {r.company_name}
                      </span>
                    </td>
                    <td className="table-cell font-mono text-xs text-gray-400">{r.isin || '—'}</td>
                    <td className="table-cell text-xs text-gray-500">{r.bse_symbol || '—'}</td>
                    <td className="table-cell text-xs text-gray-500">{r.nse_symbol || '—'}</td>
                    <td className="table-cell text-right font-semibold text-gray-800">
                      {formatCr(r.avg_market_cap_cr)}
                    </td>
                    <td className="table-cell">
                      {r.market_cap_bucket && (
                        <Badge
                          label={r.market_cap_bucket}
                          variant={bucketColor(r.market_cap_bucket) as 'blue' | 'green' | 'yellow' | 'gray'}
                        />
                      )}
                    </td>
                    <td className="table-cell text-gray-400 text-xs">{formatDate(r.effective_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > 100 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Page {page} — showing {Math.min(page * 100, data.total).toLocaleString('en-IN')} of {data.total.toLocaleString('en-IN')}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary disabled:opacity-40 py-1.5 px-3 text-xs"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
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
  )
}
