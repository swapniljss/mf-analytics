import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { AumFund } from '../../types'

interface Props {
  data: AumFund[]
}

export default function AUMTrendChart({ data }: Props) {
  const sorted = [...data].sort((a, b) => {
    if (a.fy_id !== b.fy_id) return a.fy_id - b.fy_id
    return a.period_id - b.period_id
  })

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={sorted} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <defs>
          <linearGradient id="aumGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="period_label"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          interval="preserveStartEnd"
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#6b7280' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K Cr`}
        />
        <Tooltip
          formatter={(val: number) => [`₹${(val / 1000).toFixed(2)}K Cr`, 'AUM']}
          contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
        />
        <Area
          type="monotone"
          dataKey="total_aum_cr"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#aumGradient)"
          name="Total AUM"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
