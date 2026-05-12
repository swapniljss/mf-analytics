type BadgeVariant = 'green' | 'red' | 'yellow' | 'blue' | 'gray'

const variantMap: Record<BadgeVariant, string> = {
  green: 'badge-green',
  red: 'badge-red',
  yellow: 'badge-yellow',
  blue: 'badge-blue',
  gray: 'badge-gray',
}

export function statusBadgeVariant(status?: string | null): BadgeVariant {
  switch (status?.toUpperCase()) {
    case 'SUCCESS':
    case 'PROCESSED':
    case 'RESOLVED':
    case 'Y':
      return 'green'
    case 'FAILED':
    case 'ERROR':
    case 'N':
      return 'red'
    case 'RUNNING':
    case 'PROCESSING':
      return 'yellow'
    case 'PENDING':
    case 'OPEN':
      return 'blue'
    default:
      return 'gray'
  }
}

export default function Badge({ label, variant = 'gray' }: { label: string; variant?: BadgeVariant }) {
  return <span className={variantMap[variant]}>{label}</span>
}
