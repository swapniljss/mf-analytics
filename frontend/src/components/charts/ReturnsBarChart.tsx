import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, TooltipProps } from 'recharts'
import { RETURN_PERIODS } from '../../config/constants'
import { SchemeSnapshot } from '../../types'

interface Props {
  snapshot: SchemeSnapshot
}

function GlassTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const v = payload[0].value as number
  const positive = v >= 0
  return (
    <div className="rounded-xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl ring-1 ring-gray-200 dark:ring-gray-700 shadow-soft-lg px-3 py-2 text-xs min-w-[140px]">
      <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Return {label}</div>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${positive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        <span className="font-medium text-gray-700 dark:text-gray-300">{positive ? 'Gain' : 'Loss'}</span>
        <span className={`ml-auto font-bold tabular-nums ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {v.toFixed(2)}%
        </span>
      </div>
    </div>
  )
}

export default function ReturnsBarChart({ snapshot }: Props) {
  const data = RETURN_PERIODS.map(({ key, label }) => ({
    period: label,
    return: snapshot[key as keyof SchemeSnapshot] as number | null,
  })).filter((d) => d.return != null)

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="returnGreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
            <stop offset="100%" stopColor="#059669" stopOpacity={0.85} />
          </linearGradient>
          <linearGradient id="returnRed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity={1} />
            <stop offset="100%" stopColor="#e11d48" stopOpacity={0.85} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.18)" vertical={false} />
        <XAxis dataKey="period" tick={{ fontSize: 12, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v.toFixed(0)}%`}
        />
        <Tooltip content={<GlassTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
        <Bar dataKey="return" radius={[6, 6, 0, 0]} maxBarSize={36}>
          {data.map((entry, index) => (
            <Cell key={index} fill={(entry.return ?? 0) >= 0 ? 'url(#returnGreen)' : 'url(#returnRed)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
