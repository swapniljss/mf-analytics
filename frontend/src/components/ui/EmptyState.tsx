import { PackageSearch } from 'lucide-react'

export default function EmptyState({ message = 'No data found' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <PackageSearch size={40} strokeWidth={1.5} />
      <p className="mt-3 text-sm">{message}</p>
    </div>
  )
}
