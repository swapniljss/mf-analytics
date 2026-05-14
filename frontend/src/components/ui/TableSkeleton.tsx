interface TableSkeletonProps {
  rows?: number
  cols?: number
}

export default function TableSkeleton({ rows = 10, cols = 5 }: TableSkeletonProps) {
  return (
    <div className="w-full" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 px-4 py-3 border-b border-gray-100 last:border-b-0"
        >
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className="h-3.5 rounded skeleton-bar flex-1"
              style={{
                flexBasis: j === 0 ? '15%' : j === 1 ? '30%' : 'auto',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
