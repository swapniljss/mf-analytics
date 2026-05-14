import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, TrendingUp, BarChart3, PieChart,
  FileText, Activity, Shield, Settings, Building2, Briefcase,
  Target, BarChart2, Landmark, Sparkles, X,
} from 'lucide-react'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/schemes', label: 'Schemes', icon: Building2 },
  { to: '/nav', label: 'NAV', icon: TrendingUp },
  { to: '/aum', label: 'AUM', icon: BarChart3 },
  { to: '/analytics', label: 'Analytics', icon: PieChart },
  { to: '/goal-calculator', label: 'Goal Calculator', icon: Target },
  { to: '/category', label: 'Category Compare', icon: BarChart2 },
  { to: '/tracking', label: 'Tracking', icon: Activity },
  { to: '/disclosure', label: 'Disclosure', icon: FileText },
  { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { to: '/market-cap', label: 'Market Cap', icon: Shield },
  { to: '/nps', label: 'NPS & APY', icon: Landmark },
  { to: '/admin', label: 'Admin', icon: Settings },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  return (
    <>
      {/* Mobile backdrop — only renders below lg when sidebar is open */}
      <div
        onClick={onClose}
        aria-hidden
        className={`lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40
                    transition-opacity duration-300
                    ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      />

      {/*
        Layout strategy:
          Mobile (<lg)  — `fixed inset-y-0 left-0` slides in from the left.
                          When closed: `-translate-x-full` (off-screen).
          Desktop (lg+) — `lg:sticky lg:top-0` rejoins normal flex flow.
      */}
      <aside
        className={`w-64 shrink-0
                    bg-white/85 backdrop-blur-xl border-r border-gray-200/60
                    dark:bg-gray-950/85 dark:border-gray-800/60
                    flex flex-col
                    fixed inset-y-0 left-0 h-screen z-50
                    transition-transform duration-300 ease-out
                    ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
                    lg:sticky lg:top-0 lg:translate-x-0 lg:z-20 lg:shadow-none lg:bg-white/75 lg:dark:bg-gray-950/70`}
      >
        {/* Mobile close button */}
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="lg:hidden absolute top-3 right-3 p-1.5 rounded-lg z-10
                       text-gray-500 dark:text-gray-400
                       hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-white
                       transition-colors"
          >
            <X size={18} />
          </button>
        )}

        {/* Logo block */}
        <div className="group px-5 py-5 border-b border-gray-200/60 dark:border-gray-800/60 flex items-center gap-3 cursor-default">
          <div className="relative shrink-0">
            <span
              aria-hidden
              className="absolute inset-0 rounded-xl ring-2 ring-cyan-400/40 animate-ring-pulse pointer-events-none"
            />
            <span
              aria-hidden
              className="absolute inset-0 rounded-xl ring-2 ring-cyan-400/30 animate-ring-pulse pointer-events-none"
              style={{ animationDelay: '1s' }}
            />
            <div
              className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600
                         flex items-center justify-center shadow-glow
                         transition-all duration-500 ease-out
                         group-hover:rotate-[8deg] group-hover:scale-105"
            >
              <Sparkles className="w-5 h-5 text-white animate-sparkle" strokeWidth={2.4} />
            </div>
          </div>
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold gradient-text leading-tight">MF Analytics</h1>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">AMFI Data Portal</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon }, idx) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              style={{ animationDelay: `${idx * 35}ms` }}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                 transition-all duration-300 ease-out animate-fade-in-up
                 ${
                   isActive
                     ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-glow'
                     : 'text-gray-700 hover:bg-gray-100/80 hover:text-gray-900 hover:translate-x-1 dark:text-gray-300 dark:hover:bg-gray-800/80 dark:hover:text-white'
                 }`
              }
            >
              {({ isActive }) => (
                <>
                  {!isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full
                                 bg-gradient-to-b from-blue-500 to-purple-500
                                 scale-y-0 group-hover:scale-y-100
                                 transition-transform duration-300 origin-center"
                      aria-hidden
                    />
                  )}
                  <Icon
                    size={18}
                    className={
                      isActive
                        ? 'text-white transition-transform duration-300'
                        : 'text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:scale-110 transition-all duration-300'
                    }
                  />
                  <span className="truncate">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200/60 dark:border-gray-800/60">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">v2.0.2</p>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 ring-1 ring-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/30 dark:ring-emerald-700/50 px-2 py-0.5 rounded-full">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
                <span className="relative rounded-full w-1.5 h-1.5 bg-emerald-500" />
              </span>
              Live
            </span>
          </div>
        </div>
      </aside>
    </>
  )
}
