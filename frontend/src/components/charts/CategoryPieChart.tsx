import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { CHART_COLORS } from '../../config/constants'
import { formatCrores } from '../../utils/formatters'

interface DataItem {
  name: string
  value: number
}

export default function CategoryPieChart({ data }: { data: DataItem[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((_, index) => (
            <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(val: number) => [formatCrores(val), 'AUM']} />
        <Legend
          wrapperStyle={{ fontSize: '12px' }}
          formatter={(value) => <span className="text-gray-600">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
