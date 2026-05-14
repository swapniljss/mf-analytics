import { Building2, TrendingUp, BarChart3, Activity, Sparkles, Trophy } from 'lucide-react'
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
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Page hero */}
      <div className="flex flex-wrap items-end justify-between gap-3 animate-fade-in-down">
        <div>
          <h1 className="text-3xl font-bold gradient-text flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-blue-500 dark:text-blue-400 animate-sparkle" strokeWidth={2.2} />
            Industry Pulse
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Live snapshot of the Indian mutual fund industry.
          </p>
        </div>
        {summary?.latest_nav_date && (
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400
                           bg-white/70 dark:bg-gray-800/60
                           ring-1 ring-gray-200 dark:ring-gray-700
                           backdrop-blur px-3 py-1.5 rounded-full">
            Data as of <span className="text-gray-800 dark:text-gray-100 font-semibold">{formatDate(summary.latest_nav_date)}</span>
          </span>
        )}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <KPICard
          title="Active Schemes"
          value={formatNumber(summary?.total_active_schemes)}
          icon={Building2}
          color="blue"
          variant="gradient"
          subtitle="Across all AMCs"
        />
        <KPICard
          title="Total AMCs"
          value={formatNumber(summary?.total_amcs)}
          icon={BarChart3}
          color="green"
          variant="gradient"
          subtitle="Fund houses"
        />
        <KPICard
          title="Industry AUM"
          value={formatCrores(summary?.total_industry_aum_cr)}
          icon={TrendingUp}
          color="purple"
          variant="gradient"
          subtitle="Total assets under management"
        />
        <KPICard
          title="Latest NAV Date"
          value={formatDate(summary?.latest_nav_date)}
          icon={Activity}
          color="orange"
          variant="gradient"
          subtitle="Last data refresh"
        />
      </div>

      {/* AUM Trend + Top AMCs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="group card relative overflow-hidden">
          <div className="blob-blue" aria-hidden />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Industry AUM Trend</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Quarterly aggregate across fund houses</p>
              </div>
              <div
                className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600
                           flex items-center justify-center shadow-glow
                           transition-all duration-500 ease-out
                           group-hover:rotate-[8deg] group-hover:scale-110"
              >
                <TrendingUp size={16} className="text-white transition-transform duration-500 group-hover:scale-110" />
              </div>
            </div>
            {fundwiseData?.items.length ? (
              <AUMTrendChart data={fundwiseData.items.slice(0, 20)} />
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-400 text-center py-10">No AUM data available</p>
            )}
          </div>
        </div>

        <div className="group card relative overflow-hidden">
          <div className="blob-violet" aria-hidden />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Top 10 AMCs by AUM</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Latest quarter</p>
              </div>
              <div
                className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600
                           flex items-center justify-center shadow-glow-violet
                           transition-all duration-500 ease-out
                           group-hover:rotate-[8deg] group-hover:scale-110"
              >
                <BarChart3 size={16} className="text-white transition-transform duration-500 group-hover:scale-110" />
              </div>
            </div>
            <div className="space-y-1.5">
              {fundwiseData?.items.slice(0, 10).map((amc, i) => {
                const max = fundwiseData.items[0]?.total_aum_cr || 1
                const pct = Math.max(4, Math.min(100, (Number(amc.total_aum_cr) / Number(max)) * 100))
                const rankColor =
                  i === 0 ? 'from-yellow-400 to-amber-500'
                  : i === 1 ? 'from-gray-300 to-gray-400'
                  : i === 2 ? 'from-orange-400 to-orange-500'
                  : 'from-blue-400 to-indigo-500'
                return (
                  <div
                    key={amc.id}
                    className="group/row relative flex items-center gap-3 py-1.5 px-2 rounded-lg
                               hover:bg-blue-50/40 dark:hover:bg-blue-900/10
                               transition-all duration-300 ease-out
                               hover:translate-x-0.5"
                  >
                    <span
                      className={`shrink-0 w-6 h-6 rounded-md bg-gradient-to-br ${rankColor}
                                  text-white text-[11px] font-bold flex items-center justify-center
                                  transition-transform duration-300
                                  group-hover/row:scale-110 group-hover/row:rotate-[8deg]`}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate transition-colors group-hover/row:text-blue-600 dark:group-hover/row:text-blue-300" title={amc.amc_name}>
                          {amc.amc_name}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white shrink-0 tabular-nums">
                          {formatCrores(amc.total_aum_cr)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`bar-fill h-full rounded-full bg-gradient-to-r ${rankColor} transition-all duration-700`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
              {!fundwiseData?.items.length && (
                <p className="text-sm text-gray-400 dark:text-gray-400 text-center py-6">No data available</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Top Performers */}
      <div className="group card relative overflow-hidden">
        <div className="blob-violet" aria-hidden />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600
                           flex items-center justify-center shadow-glow-emerald
                           transition-all duration-500 ease-out
                           group-hover:rotate-[8deg] group-hover:scale-110"
              >
                <Trophy size={16} className="text-white transition-transform duration-500 group-hover:scale-110" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Top Performing Schemes</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Ranked by selected return window</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {RETURN_PERIODS.slice(4).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSelectedPeriod(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    selectedPeriod === key
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-glow'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
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
                  <tr key={s.amfi_code} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors">
                    <td className="table-cell">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-600 dark:text-gray-300">
                        {i + 1}
                      </span>
                    </td>
                    <td className="table-cell font-semibold text-gray-900 dark:text-white max-w-[240px]">
                      <span className="truncate block" title={s.scheme_name}>{s.scheme_name}</span>
                    </td>
                    <td className="table-cell text-gray-600 dark:text-gray-300 max-w-[160px]">
                      <span className="truncate block">{s.amc_name || '—'}</span>
                    </td>
                    <td className="table-cell max-w-[160px]">
                      <span className="truncate block text-xs text-gray-500 dark:text-gray-400">{s.scheme_category || '—'}</span>
                    </td>
                    <td className={`table-cell text-right font-bold tabular-nums ${returnColor(s.return_value)}`}>
                      {formatReturn(s.return_value)}
                    </td>
                    <td className="table-cell text-right tabular-nums">₹{Number(s.latest_nav || 0).toFixed(2)}</td>
                    <td className="table-cell text-right tabular-nums">{formatCrores(s.aum_cr)}</td>
                  </tr>
                ))}
                {!topPerformers?.length && (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-gray-400 dark:text-gray-400 text-sm">
                      No data — run snapshot refresh from Analytics page
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
