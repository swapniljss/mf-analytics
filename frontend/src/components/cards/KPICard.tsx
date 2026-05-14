import { LucideIcon } from 'lucide-react'

export type KPIVariant = 'gradient' | 'neutral'
export type KPIColor = 'blue' | 'green' | 'purple' | 'orange' | 'rose' | 'cyan'

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  color?: KPIColor
  variant?: KPIVariant
  trend?: number
}

interface ColorSpec {
  gradient: string
  glow: string
  tileBg: string
  tileText: string
  ring: string
  darkTileBg: string
  darkTileText: string
  darkRing: string
}

const colorMap: Record<KPIColor, ColorSpec> = {
  blue:   {
    gradient: 'from-blue-500 to-indigo-600',
    glow: 'shadow-glow',
    tileBg: 'bg-blue-50', tileText: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-100',
    darkTileBg: 'dark:bg-blue-900/30', darkTileText: 'dark:text-blue-300', darkRing: 'dark:ring-blue-900/40',
  },
  green:  {
    gradient: 'from-emerald-500 to-green-600',
    glow: 'shadow-glow-emerald',
    tileBg: 'bg-emerald-50', tileText: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-100',
    darkTileBg: 'dark:bg-emerald-900/30', darkTileText: 'dark:text-emerald-300', darkRing: 'dark:ring-emerald-900/40',
  },
  purple: {
    gradient: 'from-violet-500 to-purple-600',
    glow: 'shadow-glow-violet',
    tileBg: 'bg-violet-50', tileText: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-100',
    darkTileBg: 'dark:bg-violet-900/30', darkTileText: 'dark:text-violet-300', darkRing: 'dark:ring-violet-900/40',
  },
  orange: {
    gradient: 'from-orange-500 to-amber-500',
    glow: 'shadow-glow-amber',
    tileBg: 'bg-amber-50', tileText: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-100',
    darkTileBg: 'dark:bg-amber-900/30', darkTileText: 'dark:text-amber-300', darkRing: 'dark:ring-amber-900/40',
  },
  rose:   {
    gradient: 'from-rose-500 to-pink-600',
    glow: 'shadow-glow-rose',
    tileBg: 'bg-rose-50', tileText: 'text-rose-600 dark:text-rose-400', ring: 'ring-rose-100',
    darkTileBg: 'dark:bg-rose-900/30', darkTileText: 'dark:text-rose-300', darkRing: 'dark:ring-rose-900/40',
  },
  cyan:   {
    gradient: 'from-cyan-500 to-teal-600',
    glow: 'shadow-glow-emerald',
    tileBg: 'bg-cyan-50', tileText: 'text-cyan-600 dark:text-cyan-400', ring: 'ring-cyan-100',
    darkTileBg: 'dark:bg-cyan-900/30', darkTileText: 'dark:text-cyan-300', darkRing: 'dark:ring-cyan-900/40',
  },
}

export default function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'blue',
  variant = 'gradient',
}: KPICardProps) {
  const c = colorMap[color]

  if (variant === 'gradient') {
    return (
      <div
        className={`group shine-on-hover relative overflow-hidden rounded-2xl p-5 text-white
                    bg-gradient-to-br ${c.gradient} ${c.glow}
                    transition-all duration-300 ease-out cursor-default
                    hover:-translate-y-1 hover:scale-[1.015] hover:shadow-2xl
                    active:scale-[0.99] active:translate-y-0`}
      >
        <div className="blob-white animate-blob-float" aria-hidden />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/80">
              {title}
            </p>
            <p className="mt-2 text-[1.7rem] font-bold leading-tight tracking-tight truncate transition-transform duration-300 group-hover:scale-[1.04] origin-left">
              {value}
            </p>
            {subtitle && (
              <p className="mt-1.5 text-xs text-white/75">{subtitle}</p>
            )}
          </div>
          <div
            className="shrink-0 w-11 h-11 rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm
                       flex items-center justify-center
                       transition-all duration-500 ease-out
                       group-hover:bg-white/25 group-hover:ring-white/40
                       group-hover:rotate-[8deg] group-hover:scale-110"
          >
            <Icon size={20} className="text-white transition-transform duration-500 group-hover:scale-110" />
          </div>
        </div>
      </div>
    )
  }

  // neutral variant
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl p-5
                  bg-white border border-gray-200/70 shadow-soft
                  dark:bg-gray-900/70 dark:border-gray-800/70
                  transition-all duration-300 ease-out
                  hover:-translate-y-1 hover:shadow-soft-lg hover:border-blue-200
                  dark:hover:border-blue-700/40
                  active:scale-[0.99] active:translate-y-0
                  ring-1 ${c.ring} ${c.darkRing}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {title}
          </p>
          <p className="mt-2 text-[1.45rem] font-bold text-gray-900 dark:text-white leading-tight tracking-tight truncate transition-transform duration-300 group-hover:scale-[1.04] origin-left">
            {value}
          </p>
          {subtitle && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
        <div
          className={`shrink-0 w-11 h-11 rounded-xl ${c.tileBg} ${c.darkTileBg}
                      flex items-center justify-center
                      transition-all duration-500 ease-out
                      group-hover:rotate-[8deg] group-hover:scale-110`}
        >
          <Icon
            size={20}
            className={`${c.tileText} ${c.darkTileText} transition-transform duration-500 group-hover:scale-110`}
          />
        </div>
      </div>
    </div>
  )
}
