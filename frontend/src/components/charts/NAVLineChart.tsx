import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { NAVDataPoint } from '../../types'
import { formatDate } from '../../utils/formatters'

interface Props {
  data: NAVDataPoint[]
  schemeName?: string
}

export default function NAVLineChart({ data, schemeName }: Props) {
  const formatted = data.map((d) => ({
    date: d.nav_date,
    nav: Number(d.nav),
    label: formatDate(d.nav_date),
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={formatted} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          interval="preserveStartEnd"
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#6b7280' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `₹${v.toFixed(0)}`}
        />
        <Tooltip
          formatter={(val: number) => [`₹${val.toFixed(4)}`, 'NAV']}
          labelFormatter={(label) => `Date: ${label}`}
          contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
        />
        <Line
          type="monotone"
          dataKey="nav"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          name={schemeName || 'NAV'}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
