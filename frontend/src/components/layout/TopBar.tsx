import { useLocation } from 'react-router-dom'
import {
  Calendar, Sun, Moon, LogOut, Menu,
  LayoutDashboard, Building2, TrendingUp, BarChart3, PieChart,
  Target, BarChart2, Activity, FileText, Briefcase, Shield, Landmark, Settings,
  LucideIcon,
} from 'lucide-react'
import { useDashboardSummary } from '../../hooks/useAnalytics'
import { useDarkMode } from '../../hooks/useDarkMode'
import { useAuth } from '../../hooks/useAuth'
import { formatDate } from '../../utils/formatters'

interface RouteTheme {
  Icon: LucideIcon
  gradient: string
  glow: string
  subtitle: string
}

const ROUTE_THEME: Record<string, RouteTheme> = {
  '/':                { Icon: LayoutDashboard, gradient: 'from-blue-600 to-purple-600',   glow: 'shadow-glow',         subtitle: 'Industry pulse & top performers' },
  '/schemes':         { Icon: Building2,       gradient: 'from-blue-500 to-indigo-600',   glow: 'shadow-glow',         subtitle: 'AMFI scheme master catalogue' },
  '/nav':             { Icon: TrendingUp,      gradient: 'from-emerald-500 to-green-600', glow: 'shadow-glow-emerald', subtitle: 'Daily net asset values' },
  '/aum':             { Icon: BarChart3,       gradient: 'from-violet-500 to-purple-600', glow: 'shadow-glow-violet',  subtitle: 'Assets under management' },
  '/analytics':       { Icon: PieChart,        gradient: 'from-cyan-500 to-teal-600',     glow: 'shadow-glow-emerald', subtitle: 'Returns, risk & rankings' },
  '/goal-calculator': { Icon: Target,          gradient: 'from-orange-500 to-amber-500',  glow: 'shadow-glow-amber',   subtitle: 'Plan lumpsum, SIP & retirement' },
  '/category':        { Icon: BarChart2,       gradient: 'from-teal-500 to-cyan-600',     glow: 'shadow-glow-emerald', subtitle: 'Compare peer schemes' },
  '/tracking':        { Icon: Activity,        gradient: 'from-rose-500 to-pink-600',     glow: 'shadow-glow-rose',    subtitle: 'Tracking error & difference' },
  '/disclosure':      { Icon: FileText,        gradient: 'from-cyan-500 to-blue-600',     glow: 'shadow-glow',         subtitle: 'Monthly & quarterly disclosures' },
  '/portfolio':       { Icon: Briefcase,       gradient: 'from-violet-500 to-purple-600', glow: 'shadow-glow-violet',  subtitle: 'Holdings, sectors & concentration' },
  '/market-cap':      { Icon: Shield,          gradient: 'from-amber-500 to-orange-600',  glow: 'shadow-glow-amber',   subtitle: 'Large / Mid / Small cap' },
  '/nps':             { Icon: Landmark,        gradient: 'from-emerald-500 to-teal-600',  glow: 'shadow-glow-emerald', subtitle: 'NPS & APY analytics' },
  '/admin':           { Icon: Settings,        gradient: 'from-slate-500 to-gray-600',    glow: 'shadow-soft',         subtitle: 'Logs, jobs & reconciliation' },
}

function resolveRouteTheme(path: string): RouteTheme {
  const keys = Object.keys(ROUTE_THEME).sort((a, b) => b.length - a.length)
  const match = keys.find((k) => path === k || path.startsWith(k + '/'))
  return ROUTE_THEME[match || '/']
}

interface TopBarProps {
  title: string
  onMenuClick?: () => void
}

export default function TopBar({ title, onMenuClick }: TopBarProps) {
  const { data: summary } = useDashboardSummary()
  const { enabled: dark, toggle } = useDarkMode()
  const { logout } = useAuth()
  const location = useLocation()
  const theme = resolveRouteTheme(location.pathname)
  const Icon = theme.Icon

  return (
    <header
      className="sticky top-0 z-30
                 bg-white/70 backdrop-blur-xl border-b border-gray-200/60
                 dark:bg-gray-950/70 dark:border-gray-800/60
                 px-3 sm:px-5 lg:px-6 py-2.5 sm:py-3.5
                 flex items-center justify-between gap-2 sm:gap-4"
    >
      {/* Left: hamburger (mobile) + icon tile + title + subtitle */}
      <div className="group flex items-center gap-2 sm:gap-3 min-w-0 flex-1">

        {/* Mobile hamburger — opens the sidebar */}
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            aria-label="Open menu"
            className="lg:hidden shrink-0 p-2 -ml-1 rounded-lg
                       text-gray-700 dark:text-gray-200
                       hover:bg-gray-100 dark:hover:bg-gray-800
                       active:scale-95 transition-all duration-200"
          >
            <Menu size={20} />
          </button>
        )}

        {/* Colored icon tile */}
        <div
          className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${theme.gradient} ${theme.glow}
                      flex items-center justify-center
                      transition-all duration-500 ease-out
                      group-hover:scale-105 group-hover:rotate-[6deg]`}
        >
          <Icon
            size={17}
            className="text-white transition-transform duration-500 group-hover:scale-110"
            strokeWidth={2.2}
          />
        </div>

        {/* Title + subtitle */}
        <div className="min-w-0 flex-1">
          <h2 className="text-base sm:text-lg lg:text-xl font-bold gradient-text truncate leading-tight">
            {title}
          </h2>
          <p className="hidden sm:block text-[11px] font-medium text-gray-500 dark:text-gray-400 truncate">
            {theme.subtitle}
          </p>
        </div>
      </div>

      {/* Right: NAV chip (md+) + dark toggle + logout */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {summary?.latest_nav_date && (
          <span
            className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium
                       text-blue-700 bg-blue-50 ring-1 ring-blue-200
                       dark:text-blue-300 dark:bg-blue-900/30 dark:ring-blue-700/50
                       px-3 py-1.5 rounded-full mr-1"
          >
            <Calendar size={13} className="text-blue-500 dark:text-blue-400" />
            <span className="whitespace-nowrap">Latest NAV: {formatDate(summary.latest_nav_date)}</span>
          </span>
        )}

        {/* Dark mode toggle */}
        <button
          onClick={toggle}
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-pressed={dark}
          title={dark ? 'Light mode' : 'Dark mode'}
          className="relative p-2 rounded-xl text-gray-600 hover:text-gray-900
                     hover:bg-gray-100 transition-all duration-300
                     dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800
                     ring-1 ring-transparent hover:ring-gray-200 dark:hover:ring-gray-700
                     hover:scale-110 active:scale-95"
        >
          <span className="relative block w-[18px] h-[18px]">
            <Sun
              size={18}
              className={`absolute inset-0 transition-all duration-500 ease-out
                          ${dark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-180 scale-50'}`}
            />
            <Moon
              size={18}
              className={`absolute inset-0 transition-all duration-500 ease-out
                          ${dark ? 'opacity-0 -rotate-180 scale-50' : 'opacity-100 rotate-0 scale-100'}`}
            />
          </span>
        </button>

        {/* Logout */}
        <button
          onClick={logout}
          aria-label="Sign out"
          title="Sign out"
          className="p-2 rounded-xl text-gray-600 hover:text-rose-600
                     hover:bg-rose-50 transition-all duration-300
                     dark:text-gray-300 dark:hover:text-rose-300 dark:hover:bg-rose-900/30
                     ring-1 ring-transparent hover:ring-rose-200 dark:hover:ring-rose-700/40
                     hover:scale-110 active:scale-95"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  )
}
