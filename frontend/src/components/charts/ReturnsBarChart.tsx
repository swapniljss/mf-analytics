import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { RETURN_PERIODS } from '../../config/constants'
import { SchemeSnapshot } from '../../types'

interface Props {
  snapshot: SchemeSnapshot
}

export default function ReturnsBarChart({ snapshot }: Props) {
  const data = RETURN_PERIODS.map(({ key, label }) => ({
    period: label,
    return: snapshot[key as keyof SchemeSnapshot] as number | null,
  })).filter((d) => d.return != null)

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="period" tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: '#6b7280' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v.toFixed(0)}%`}
        />
        <Tooltip formatter={(val: number) => [`${val.toFixed(2)}%`, 'Return']} />
        <Bar dataKey="return" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={index} fill={(entry.return ?? 0) >= 0 ? '#10b981' : '#ef4444'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
