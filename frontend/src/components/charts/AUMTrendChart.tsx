import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, TooltipProps } from 'recharts'
import { AumFund } from '../../types'

interface Props {
  data: AumFund[]
}

function GlassTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const v = payload[0].value as number
  return (
    <div className="rounded-xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl ring-1 ring-gray-200 dark:ring-gray-700 shadow-soft-lg px-3 py-2 text-xs">
      <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{label}</div>
      <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
        <span className="w-2 h-2 rounded-full bg-blue-500" />
        <span className="font-medium">AUM</span>
        <span className="ml-3 font-bold tabular-nums">₹{(v / 1000).toFixed(2)}K Cr</span>
      </div>
    </div>
  )
}

export default function AUMTrendChart({ data }: Props) {
  const sorted = [...data].sort((a, b) => {
    if (a.fy_id !== b.fy_id) return a.fy_id - b.fy_id
    return a.period_id - b.period_id
  })

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={sorted} margin={{ top: 8, right: 16, left: 4, bottom: 5 }}>
        <defs>
          <linearGradient id="aumGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.28} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.18)" vertical={false} />
        <XAxis
          dataKey="period_label"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          interval="preserveStartEnd"
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K Cr`}
        />
        <Tooltip content={<GlassTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
        <Area
          type="monotone"
          dataKey="total_aum_cr"
          stroke="#3b82f6"
          strokeWidth={2.4}
          fill="url(#aumGradient)"
          name="Total AUM"
          activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: '#3b82f6' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
