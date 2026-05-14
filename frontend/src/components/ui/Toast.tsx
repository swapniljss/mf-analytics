import { useEffect } from 'react'
import { CheckCircle2, Info, AlertCircle, X } from 'lucide-react'

type ToastType = 'success' | 'info' | 'error'

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

  const styles: Record<ToastType, { ring: string; text: string; icon: string; iconBg: string }> = {
    success: {
      ring: 'ring-emerald-200 dark:ring-emerald-700/50',
      text: 'text-emerald-800 dark:text-emerald-200',
      icon: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-900/30',
    },
    info: {
      ring: 'ring-blue-200 dark:ring-blue-700/50',
      text: 'text-blue-800 dark:text-blue-200',
      icon: 'text-blue-600 dark:text-blue-400',
      iconBg: 'bg-blue-50 dark:bg-blue-900/30',
    },
    error: {
      ring: 'ring-rose-200 dark:ring-rose-700/50',
      text: 'text-rose-800 dark:text-rose-200',
      icon: 'text-rose-600 dark:text-rose-400',
      iconBg: 'bg-rose-50 dark:bg-rose-900/30',
    },
  }
  const Icon = type === 'success' ? CheckCircle2 : type === 'error' ? AlertCircle : Info
  const s = styles[type]

  return (
    <div className="fixed bottom-5 right-5 z-50 pointer-events-none">
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto flex items-start gap-3 pl-3 pr-4 py-3 rounded-2xl
                    bg-white/95 backdrop-blur-xl ring-1 ${s.ring} shadow-soft-lg max-w-sm
                    dark:bg-gray-900/95
                    animate-slide-up`}
      >
        <div className={`mt-0.5 w-7 h-7 rounded-lg ${s.iconBg} flex items-center justify-center shrink-0`}>
          <Icon size={16} className={s.icon} />
        </div>
        <span className={`text-sm font-medium flex-1 ${s.text}`}>{message}</span>
        <button
          onClick={onDismiss}
          className="opacity-60 hover:opacity-100 transition-opacity shrink-0 self-start mt-1 text-gray-500 dark:text-gray-400"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
