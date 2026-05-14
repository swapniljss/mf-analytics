export default function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeMap = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' }
  return (
    <div className="flex justify-center items-center py-10" role="status" aria-label="Loading">
      <div
        className={`${sizeMap[size]} rounded-full animate-spin
                    border-[3px] border-blue-100 dark:border-blue-900/40
                    border-t-blue-600 border-r-purple-600`}
      />
    </div>
  )
}
