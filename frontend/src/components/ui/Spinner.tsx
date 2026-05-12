export default function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeMap = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' }
  return (
    <div className="flex justify-center items-center py-8">
      <div className={`${sizeMap[size]} animate-spin rounded-full border-2 border-gray-200 border-t-blue-600`} />
    </div>
  )
}
