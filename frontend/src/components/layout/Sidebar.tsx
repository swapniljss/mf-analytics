import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, TrendingUp, BarChart3, PieChart,
  FileText, Activity, Shield, Settings, Building2, Briefcase,
  Target, BarChart2, Landmark,
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

export default function Sidebar() {
  return (
    <aside className="w-60 bg-gray-900 text-white flex flex-col min-h-screen">
      <div className="px-6 py-5 border-b border-gray-700">
        <h1 className="text-lg font-bold text-white">MF Analytics</h1>
        <p className="text-xs text-gray-400 mt-0.5">AMFI Data Dashboard</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-6 py-4 border-t border-gray-700">
        <p className="text-xs text-gray-500">v1.0.0</p>
      </div>
    </aside>
  )
}
