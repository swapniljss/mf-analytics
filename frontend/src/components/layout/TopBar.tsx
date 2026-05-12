import { Bell } from 'lucide-react'
import { useDashboardSummary } from '../../hooks/useAnalytics'
import { formatDate } from '../../utils/formatters'

export default function TopBar({ title }: { title: string }) {
  const { data: summary } = useDashboardSummary()

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
      <div className="flex items-center gap-4">
        {summary?.latest_nav_date && (
          <span className="text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">
            Latest NAV: {formatDate(summary.latest_nav_date)}
          </span>
        )}
        <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
          <Bell size={18} />
        </button>
      </div>
    </header>
  )
}
