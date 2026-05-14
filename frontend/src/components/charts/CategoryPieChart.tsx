import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, TooltipProps } from 'recharts'
import { CHART_COLORS } from '../../config/constants'
import { formatCrores } from '../../utils/formatters'

interface DataItem {
  name: string
  value: number
}

function GlassTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  return (
    <div className="rounded-xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl ring-1 ring-gray-200 dark:ring-gray-700 shadow-soft-lg px-3 py-2 text-xs min-w-[160px]">
      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: item.payload.fill || item.color }}
        />
        <span className="font-semibold text-gray-900 dark:text-gray-100">{item.name}</span>
      </div>
      <div className="mt-1 flex justify-between text-gray-700 dark:text-gray-300">
        <span>AUM</span>
        <span className="font-bold tabular-nums">{formatCrores(item.value as number)}</span>
      </div>
    </div>
  )
}

export default function CategoryPieChart({ data }: { data: DataItem[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          innerRadius={64}
          outerRadius={104}
          paddingAngle={3}
          dataKey="value"
          stroke="rgba(255,255,255,0.85)"
          strokeWidth={2}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<GlassTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }}
          iconType="circle"
          iconSize={8}
          formatter={(value) => <span className="text-gray-600 dark:text-gray-300">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
