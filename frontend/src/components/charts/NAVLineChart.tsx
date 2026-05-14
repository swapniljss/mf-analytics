import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, TooltipProps,
} from 'recharts'
import { NAVDataPoint } from '../../types'
import { formatDate } from '../../utils/formatters'

interface Props {
  data: NAVDataPoint[]
  schemeName?: string
}

function GlassTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const v = payload[0].value as number
  return (
    <div className="rounded-xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl ring-1 ring-gray-200 dark:ring-gray-700 shadow-soft-lg px-3 py-2 text-xs min-w-[150px]">
      <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{label}</div>
      <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
        <span className="w-2 h-2 rounded-full bg-blue-500" />
        <span className="font-medium">NAV</span>
        <span className="ml-auto font-bold tabular-nums">₹{v.toFixed(4)}</span>
      </div>
    </div>
  )
}

export default function NAVLineChart({ data, schemeName }: Props) {
  const formatted = data.map((d) => ({
    date: d.nav_date,
    nav: Number(d.nav),
    label: formatDate(d.nav_date),
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={formatted} margin={{ top: 8, right: 16, left: 4, bottom: 5 }}>
        <defs>
          <linearGradient id="navGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.18)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          interval="preserveStartEnd"
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `₹${v.toFixed(0)}`}
        />
        <Tooltip content={<GlassTooltip />} cursor={{ stroke: '#cbd5e1', strokeDasharray: '4 4' }} />
        <Line
          type="monotone"
          dataKey="nav"
          stroke="url(#navGradient)"
          strokeWidth={2.4}
          dot={false}
          activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: '#6366f1' }}
          name={schemeName || 'NAV'}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
