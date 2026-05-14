import { PackageSearch } from 'lucide-react'

export default function EmptyState({ message = 'No data found' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-400">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 ring-1 ring-blue-100
                      dark:from-blue-900/30 dark:to-purple-900/30 dark:ring-blue-900/40
                      flex items-center justify-center">
        <PackageSearch size={28} strokeWidth={1.7} className="text-blue-500 dark:text-blue-400" />
      </div>
      <p className="mt-4 text-sm font-medium text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  )
}
