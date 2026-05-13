/** Coerce API value (may arrive as string from Python Decimal) to number or null. */
function toNum(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  return isNaN(n) ? null : n
}

export function formatCrores(value?: unknown): string {
  const v = toNum(value)
  if (v == null) return '—'
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L Cr`
  if (v >= 1000)   return `₹${(v / 1000).toFixed(2)}K Cr`
  return `₹${v.toFixed(2)} Cr`
}

export function formatReturn(value?: unknown): string {
  const v = toNum(value)
  if (v == null) return '—'
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}%`
}

export function returnColor(value?: unknown): string {
  const v = toNum(value)
  if (v == null) return 'text-gray-500'
  return v >= 0 ? 'text-green-600' : 'text-red-600'
}

export function formatNAV(value?: unknown): string {
  const v = toNum(value)
  if (v == null) return '—'
  return `₹${v.toFixed(4)}`
}

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatNumber(value?: unknown): string {
  const v = toNum(value)
  if (v == null) return '—'
  return new Intl.NumberFormat('en-IN').format(v)
}

export function formatPercent(value?: unknown, decimals = 2): string {
  const v = toNum(value)
  if (v == null) return '—'
  return `${v.toFixed(decimals)}%`
}

export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (isNaN(then)) return 'never'
  const diffSec = Math.floor((Date.now() - then) / 1000)
  if (diffSec < 30) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hr ago`
  const days = Math.floor(diffSec / 86400)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
