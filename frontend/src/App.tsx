import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import Sidebar from './components/layout/Sidebar'
import TopBar from './components/layout/TopBar'
import ErrorBoundary from './components/ui/ErrorBoundary'
import DashboardPage from './pages/DashboardPage'
import SchemesPage from './pages/SchemesPage'
import SchemeDetailPage from './pages/SchemeDetailPage'
import NAVPage from './pages/NAVPage'
import AUMPage from './pages/AUMPage'
import AnalyticsPage from './pages/AnalyticsPage'
import TrackingPage from './pages/TrackingPage'
import DisclosurePage from './pages/DisclosurePage'
import MarketCapPage from './pages/MarketCapPage'
import PortfolioPage from './pages/PortfolioPage'
import AdminPage from './pages/AdminPage'
import GoalCalculatorPage from './pages/GoalCalculatorPage'
import CategoryComparisonPage from './pages/CategoryComparisonPage'
import NPSPage from './pages/NPSPage'

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

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={title} />
        <main className="flex-1 overflow-auto">
          <ErrorBoundary>
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
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}
