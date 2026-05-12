import { Building2, TrendingUp, BarChart3, Activity } from 'lucide-react'
import { useDashboardSummary, useTopPerformers } from '../hooks/useAnalytics'
import { useAumFundwise, useAumPeriods } from '../hooks/useAUM'
import KPICard from '../components/cards/KPICard'
import Spinner from '../components/ui/Spinner'
import AUMTrendChart from '../components/charts/AUMTrendChart'
import { formatCrores, formatNumber, formatReturn, returnColor, formatDate } from '../utils/formatters'
import { RETURN_PERIODS } from '../config/constants'
import { useState } from 'react'

export default function DashboardPage() {
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary()
  const { data: periods } = useAumPeriods()
  const [selectedPeriod, setSelectedPeriod] = useState('return_1y')

  const latestPeriod = periods?.[0]
  const { data: fundwiseData } = useAumFundwise({
    fy_id: latestPeriod?.fy_id,
    period_id: latestPeriod?.period_id,
    page_size: 100,
  })

  const { data: topPerformers } = useTopPerformers({ period: selectedPeriod, limit: 10 })

  if (summaryLoading) return <Spinner />

  return (
    <div className="p-6 space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Active Schemes"
          value={formatNumber(summary?.total_active_schemes)}
          icon={Building2}
          color="blue"
          subtitle="Across all AMCs"
        />
        <KPICard
          title="Total AMCs"
          value={formatNumber(summary?.total_amcs)}
          icon={BarChart3}
          color="green"
          subtitle="Fund houses"
        />
        <KPICard
          title="Industry AUM"
          value={formatCrores(summary?.total_industry_aum_cr)}
          icon={TrendingUp}
          color="purple"
          subtitle="Total assets under management"
        />
        <KPICard
          title="Latest NAV Date"
          value={formatDate(summary?.latest_nav_date)}
          icon={Activity}
          color="orange"
          subtitle="Last data refresh"
        />
      </div>

      {/* AUM Trend + Top AMCs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Industry AUM Trend</h3>
          {fundwiseData?.items.length ? (
            <AUMTrendChart data={fundwiseData.items.slice(0, 20)} />
          ) : (
            <p className="text-sm text-gray-400 text-center py-10">No AUM data available</p>
          )}
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Top 10 AMCs by AUM</h3>
          <div className="space-y-2">
            {fundwiseData?.items.slice(0, 10).map((amc, i) => (
              <div key={amc.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-400 w-5">{i + 1}</span>
                  <span className="text-sm text-gray-700 truncate max-w-[180px]">{amc.amc_name}</span>
                </div>
                <span className="text-sm font-medium text-gray-900">{formatCrores(amc.total_aum_cr)}</span>
              </div>
            ))}
            {!fundwiseData?.items.length && (
              <p className="text-sm text-gray-400 text-center py-6">No data available</p>
            )}
          </div>
        </div>
      </div>

      {/* Top Performers */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Top Performing Schemes</h3>
          <div className="flex gap-1">
            {RETURN_PERIODS.slice(4).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSelectedPeriod(key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  selectedPeriod === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="table-header">#</th>
                <th className="table-header">Scheme</th>
                <th className="table-header">AMC</th>
                <th className="table-header">Category</th>
                <th className="table-header text-right">Return</th>
                <th className="table-header text-right">Latest NAV</th>
                <th className="table-header text-right">AUM</th>
              </tr>
            </thead>
            <tbody>
              {topPerformers?.map((s, i) => (
                <tr key={s.amfi_code} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="table-cell text-gray-400">{i + 1}</td>
                  <td className="table-cell font-medium text-gray-900 max-w-[220px]">
                    <span className="truncate block" title={s.scheme_name}>{s.scheme_name}</span>
                  </td>
                  <td className="table-cell text-gray-500 max-w-[150px]">
                    <span className="truncate block">{s.amc_name || '—'}</span>
                  </td>
                  <td className="table-cell text-gray-500 max-w-[150px]">
                    <span className="truncate block text-xs">{s.scheme_category || '—'}</span>
                  </td>
                  <td className={`table-cell text-right font-semibold ${returnColor(s.return_value)}`}>
                    {formatReturn(s.return_value)}
                  </td>
                  <td className="table-cell text-right">₹{Number(s.latest_nav || 0).toFixed(2)}</td>
                  <td className="table-cell text-right">{formatCrores(s.aum_cr)}</td>
                </tr>
              ))}
              {!topPerformers?.length && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400 text-sm">
                    No data — run snapshot refresh from Analytics page
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
