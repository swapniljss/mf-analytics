import { useEffect } from 'react'
import { CheckCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'info'

interface ToastProps {
  message: string | null
  type?: ToastType
  autoDismissMs?: number
  onDismiss: () => void
}

export default function Toast({
  message,
  type = 'info',
  autoDismissMs = 5000,
  onDismiss,
}: ToastProps) {
  useEffect(() => {
    if (!message || autoDismissMs <= 0) return
    const t = setTimeout(onDismiss, autoDismissMs)
    return () => clearTimeout(t)
  }, [message, autoDismissMs, onDismiss])

  if (!message) return null

  const styles: Record<ToastType, string> = {
    success: 'bg-green-50 border-green-200 text-green-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  }
  const Icon = type === 'success' ? CheckCircle : Info

  return (
    <div className="fixed bottom-4 right-4 z-50 pointer-events-none">
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto flex items-start gap-2 px-4 py-3 rounded-lg border shadow-lg max-w-sm ${styles[type]}`}
      >
        <Icon size={18} className="mt-0.5 shrink-0" />
        <span className="text-sm font-medium flex-1">{message}</span>
        <button
          onClick={onDismiss}
          className="opacity-60 hover:opacity-100 transition-opacity shrink-0"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
