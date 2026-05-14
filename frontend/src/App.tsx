import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { lazy, Suspense, useState, useEffect } from 'react'
import Sidebar from './components/layout/Sidebar'
import TopBar from './components/layout/TopBar'
import ErrorBoundary from './components/ui/ErrorBoundary'
import Spinner from './components/ui/Spinner'
import LoginPage from './pages/LoginPage'
import { useAuth, AuthProvider } from './hooks/useAuth'

const DashboardPage         = lazy(() => import('./pages/DashboardPage'))
const SchemesPage           = lazy(() => import('./pages/SchemesPage'))
const SchemeDetailPage      = lazy(() => import('./pages/SchemeDetailPage'))
const NAVPage               = lazy(() => import('./pages/NAVPage'))
const AUMPage               = lazy(() => import('./pages/AUMPage'))
const AnalyticsPage         = lazy(() => import('./pages/AnalyticsPage'))
const TrackingPage          = lazy(() => import('./pages/TrackingPage'))
const DisclosurePage        = lazy(() => import('./pages/DisclosurePage'))
const MarketCapPage         = lazy(() => import('./pages/MarketCapPage'))
const PortfolioPage         = lazy(() => import('./pages/PortfolioPage'))
const AdminPage             = lazy(() => import('./pages/AdminPage'))
const GoalCalculatorPage    = lazy(() => import('./pages/GoalCalculatorPage'))
const CategoryComparisonPage = lazy(() => import('./pages/CategoryComparisonPage'))
const NPSPage               = lazy(() => import('./pages/NPSPage'))

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/schemes': 'Scheme Master',
  '/nav': 'NAV Data',
  '/aum': 'Average AUM',
  '/analytics': 'Analytics & Returns',
  '/tracking': 'Tracking Error & Difference',
  '/disclosure': 'Disclosures',
  '/portfolio': 'Portfolio Holdings',
  '/market-cap': 'Market Cap Categorization',
  '/admin': 'Admin & Observability',
  '/goal-calculator': 'Goal Calculator',
  '/category': 'Category Comparison',
  '/nps': 'NPS & APY Analytics',
}

function Layout() {
  const location = useLocation()
  const titleKey = Object.keys(PAGE_TITLES)
    .sort((a, b) => b.length - a.length)
    .find((k) => location.pathname === k || location.pathname.startsWith(k + '/'))
  const title = PAGE_TITLES[titleKey || '/'] || 'Mutual Fund Analytics'

  // Mobile sidebar — collapsed by default below lg, opens via hamburger.
  // Auto-closes when the route changes so navigation feels natural.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  useEffect(() => { setMobileSidebarOpen(false) }, [location.pathname])

  return (
    <div className="flex min-h-screen animate-dashboard-enter">
      <Sidebar isOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={title} onMenuClick={() => setMobileSidebarOpen(true)} />
        <main className="flex-1 overflow-auto">
          <ErrorBoundary>
            <Suspense fallback={<div className="p-6"><Spinner /></div>}>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/schemes" element={<SchemesPage />} />
                <Route path="/schemes/:amfiCode" element={<SchemeDetailPage />} />
                <Route path="/nav" element={<NAVPage />} />
                <Route path="/aum" element={<AUMPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/tracking" element={<TrackingPage />} />
                <Route path="/disclosure" element={<DisclosurePage />} />
                <Route path="/portfolio" element={<PortfolioPage />} />
                <Route path="/market-cap" element={<MarketCapPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/goal-calculator" element={<GoalCalculatorPage />} />
                <Route path="/category" element={<CategoryComparisonPage />} />
                <Route path="/nps" element={<NPSPage />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}

// Auth gate — picks LoginPage vs Layout based on local hardcoded-credentials
// session. Sits OUTSIDE Layout so Layout never conditionally calls hooks.
function AuthGate() {
  const { authed } = useAuth()
  return authed ? <Layout /> : <LoginPage />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </BrowserRouter>
  )
}
