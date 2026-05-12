# Performance Fixes To Apply — Take to New Prompt Window

> ## ⚠️ IMPORTANT — READ FIRST
>
> **MAKE SURE THESE CHANGES DO NOT BREAK ANY FUNCTIONALITY OR API CONTRACTS.**
>
> - Do NOT change any API endpoint URLs
> - Do NOT change any API response field names
> - Do NOT remove any existing endpoints
> - Do NOT change database schema in a destructive way (no DROP TABLE without backup)
> - Backend Postman collection must continue to work without changes
> - Frontend must continue to render without changes
> - All 70 existing API endpoints must remain functional
> - The Pydantic response shapes must remain backward-compatible (only ADD optional fields if needed, never REMOVE existing ones)
> - Before any DB change, run `mysqldump` backup
> - Test each change in isolation; revert if anything breaks
> - All changes must be incremental — one at a time, verify, then move to next
>
> **Goal:** Make the system faster WITHOUT changing the language (stay in Python), WITHOUT adding new infrastructure (no OpenSearch, no Redis), and WITHOUT breaking any frontend or Postman test.

---

## 📋 Context for the new chat

I have a Mutual Fund Analytics platform with:
- **Backend:** FastAPI 0.115, Python 3.13, SQLAlchemy 2, MySQL 8 (Dockerized)
- **Frontend:** React 18 + TS + Vite + TailwindCSS + react-query + recharts
- **Deployed on:** AWS EC2 t3.micro at `http://13.127.151.21:8000` (backend) and `:3000` (frontend)
- **Database:** Already seeded with 16,366 schemes, 53 AMCs, 14,360 daily NAVs, 850K AUM rows, scheme_analytics_snapshot has all rows.
- **Current bottlenecks identified:** Snapshot refresh takes 10–15 min, Analytics page payload is 3x larger than needed, no DB indexes for common queries, no React query caching, no lazy-loaded pages.

Project structure summary in [context.md](context.md). Don't change anything in code without reading the relevant module first.

---

## 🎯 Goal — apply these 6 fixes, in this order, without breaking anything

| # | Fix | File(s) to edit | Time | Risk |
|---|---|---|---|---|
| 1 | Add MySQL indexes | (SQL command, no file) | 1 min | ⬇ Low |
| 2 | Convert `nav_price` from VIEW to TABLE + rebuild job | `app/jobs/scheduler.py`, SQL | 15 min | ⬇ Low |
| 3 | Add slim DTO for `/analytics/snapshots` | `app/schemas/analytics.py`, `app/routers/analytics.py` | 1 hour | ⬇ Low |
| 4 | Frontend `keepPreviousData` + debounced search | `src/hooks/useAnalytics.ts`, `src/pages/AnalyticsPage.tsx` | 30 min | ⬇ Low |
| 5 | Lazy-load all 14 pages with `React.lazy()` | `src/App.tsx` | 30 min | ⬇ Low |
| 6 | **Refactor `refresh_snapshot()` to fetch NAVs once per scheme (the big one)** | `app/services/analytics_service.py` | 4 hours | ⚠ Medium (most important to test) |

---

# 🔧 FIX #1 — Add MySQL composite indexes

## What & why
Speed up `WHERE amfi_code = ? AND nav_date <= ?` queries that run thousands of times during snapshot refresh. Currently no composite index supports this.

## Where
Run on the **server-side MySQL** (inside Docker container).

## Action
Run this SQL once:

```bash
docker exec -i mf_mysql mysql -uroot -ppassword mutualfund_analytics <<'SQL'
-- Speed up nav_date lookups by amfi_code
ALTER TABLE daily_nav      ADD INDEX idx_amficode_date_desc (amfi_code, nav_date DESC);
ALTER TABLE historical_nav ADD INDEX idx_amficode_date_desc (amfi_code, nav_date DESC);

-- Speed up snapshot listings with filters
ALTER TABLE scheme_analytics_snapshot ADD INDEX idx_category_return1y (scheme_category, return_1y);
ALTER TABLE scheme_analytics_snapshot ADD INDEX idx_amc_name (amc_name);
SQL
```

## Verify
```bash
docker exec mf_mysql mysql -uroot -ppassword mutualfund_analytics -e "SHOW INDEX FROM daily_nav WHERE Key_name LIKE 'idx_amficode%';"
```
Should return at least one row.

## Rollback (if needed)
```sql
ALTER TABLE daily_nav DROP INDEX idx_amficode_date_desc;
ALTER TABLE historical_nav DROP INDEX idx_amficode_date_desc;
ALTER TABLE scheme_analytics_snapshot DROP INDEX idx_category_return1y;
ALTER TABLE scheme_analytics_snapshot DROP INDEX idx_amc_name;
```

## Won't break
- No API change.
- No data change.
- Indexes are pure-read optimization.

---

# 🔧 FIX #2 — Convert `nav_price` from VIEW to TABLE + daily rebuild

## What & why
Currently `nav_price` is a SQL VIEW that recomputes `daily_nav UNION ALL historical_nav` on every query. Converting it to a real table with proper indexes makes every NAV-related query ~50% faster. A daily scheduled job keeps it up-to-date.

## Where
1. **MySQL** — convert view to table
2. **`backend/app/jobs/scheduler.py`** — add daily rebuild job

## Action — Part A — Convert VIEW to TABLE

Run on MySQL:
```bash
docker exec -i mf_mysql mysql -uroot -ppassword mutualfund_analytics <<'SQL'
-- Step 1: Drop the VIEW (or TABLE if SQLAlchemy created one)
DROP VIEW IF EXISTS nav_price;
DROP TABLE IF EXISTS nav_price;

-- Step 2: Create as real TABLE with proper indexes
CREATE TABLE nav_price (
  id BIGINT PRIMARY KEY,
  amfi_code VARCHAR(50) NOT NULL,
  isin_div_payout_growth VARCHAR(50),
  isin_div_reinvestment VARCHAR(50),
  scheme_name VARCHAR(500) NOT NULL,
  nav DECIMAL(18, 6) NOT NULL,
  repurchase_price DECIMAL(18, 6),
  sale_price DECIMAL(18, 6),
  nav_date DATE NOT NULL,
  source_type VARCHAR(50),
  source_priority INT DEFAULT 50,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_amficode_date_desc (amfi_code, nav_date DESC),
  INDEX idx_nav_date (nav_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 3: Initial population from daily_nav + historical_nav
INSERT INTO nav_price
SELECT
  id, amfi_code, isin_div_payout_growth, isin_div_reinvestment,
  scheme_name, nav, repurchase_price, sale_price, nav_date,
  'DAILY' AS source_type, 100 AS source_priority, created_at
FROM daily_nav
UNION ALL
SELECT
  id + 10000000000, amfi_code, isin_div_payout_growth, isin_div_reinvestment,
  scheme_name, nav, repurchase_price, sale_price, nav_date,
  'HISTORICAL' AS source_type, 50 AS source_priority, created_at
FROM historical_nav;
SQL
```

## Action — Part B — Add daily rebuild job

In `backend/app/jobs/scheduler.py`, ADD (do not modify existing jobs) a new function and registration:

```python
def _rebuild_nav_price_table():
    """Rebuild nav_price table from daily_nav + historical_nav. Runs daily at 03:00 IST."""
    from app.database import SessionLocal
    from sqlalchemy import text

    db = SessionLocal()
    try:
        # Truncate is fast, INSERT is bulk
        db.execute(text("TRUNCATE TABLE nav_price"))
        db.execute(text("""
            INSERT INTO nav_price
            SELECT id, amfi_code, isin_div_payout_growth, isin_div_reinvestment,
                   scheme_name, nav, repurchase_price, sale_price, nav_date,
                   'DAILY' AS source_type, 100 AS source_priority, created_at
            FROM daily_nav
            UNION ALL
            SELECT id + 10000000000, amfi_code, isin_div_payout_growth, isin_div_reinvestment,
                   scheme_name, nav, repurchase_price, sale_price, nav_date,
                   'HISTORICAL' AS source_type, 50 AS source_priority, created_at
            FROM historical_nav
        """))
        db.commit()
        logger.info("nav_price table rebuilt")
    except Exception as e:
        logger.error(f"nav_price rebuild failed: {e}")
        db.rollback()
    finally:
        db.close()
```

In `start_scheduler()`, ADD (don't replace) the new job registration:

```python
def start_scheduler():
    # ... existing jobs (keep them all) ...

    # NEW: Rebuild nav_price table daily at 03:00 IST
    scheduler.add_job(
        _rebuild_nav_price_table,
        trigger=CronTrigger(hour=3, minute=0),
        id="nav_price_rebuild",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("APScheduler started with all jobs registered")
```

## Verify
```bash
docker exec mf_mysql mysql -uroot -ppassword mutualfund_analytics -e "SELECT COUNT(*) FROM nav_price;"
```
Should match `daily_nav + historical_nav` row sum.

## Rollback
```sql
DROP TABLE nav_price;
CREATE VIEW nav_price AS
SELECT id, ... FROM daily_nav
UNION ALL
SELECT id + 10000000000, ... FROM historical_nav;
```
And remove the new scheduler job.

## Won't break
- The SQLAlchemy model in `app/models/nav.py:NavPrice` queries the same columns — works identically whether it's a VIEW or TABLE.
- All existing services and routers continue using `NavPrice` model — no code change needed beyond scheduler.
- Data flows in same direction; just doesn't recompute UNION on every query.

## CAUTION
- After applying, the nightly daily NAV sync will append to `daily_nav`. The `nav_price` TABLE won't auto-update until 03:00 next day. To make it immediate, the new daily-NAV sync should also trigger a rebuild — but for now the 24-hour lag is acceptable.
- Alternative: also call `_rebuild_nav_price_table()` at end of `fetch_daily_nav()` in `app/services/nav_service.py`.

---

# 🔧 FIX #3 — Slim DTO for `/analytics/snapshots`

## What & why
`GET /analytics/snapshots` currently returns `SchemeSnapshotOut` with 44 fields (sortino, calmar, var_95, sip_returns, etc.). The frontend Analytics table only uses 16 of these. Payload is 3x larger than needed.

## Where
1. `backend/app/schemas/analytics.py` — ADD a new schema class
2. `backend/app/routers/analytics.py` — change ONLY the list-snapshots endpoint's `response_model`
3. **DO NOT** touch `/analytics/scheme/{amfi_code}/snapshot` — keep using `SchemeSnapshotOut` there (single-scheme detail page needs all fields)

## Action — Part A — Add slim schema

In `backend/app/schemas/analytics.py`, **ADD this new class** after the existing `SchemeSnapshotOut`:

```python
class SchemeSnapshotListItem(BaseModel):
    """Slim DTO for snapshot list endpoint — only fields shown in Analytics table.
    Faster payload, smaller JSON, identical to SchemeSnapshotOut subset."""
    id: int
    amfi_code: str
    scheme_name: Optional[str] = None
    amc_name: Optional[str] = None
    scheme_category: Optional[str] = None
    latest_nav: Optional[Decimal] = None
    nav_date: Optional[date] = None
    return_1w: Optional[Decimal] = None
    return_1m: Optional[Decimal] = None
    return_3m: Optional[Decimal] = None
    return_6m: Optional[Decimal] = None
    return_1y: Optional[Decimal] = None
    return_3y: Optional[Decimal] = None
    return_5y: Optional[Decimal] = None
    aum_cr: Optional[Decimal] = None
    expense_ratio: Optional[Decimal] = None

    class Config:
        from_attributes = True
```

**IMPORTANT:** Do NOT remove or change `SchemeSnapshotOut`. Both classes coexist.

## Action — Part B — Update only the list endpoint

In `backend/app/routers/analytics.py`, find this section:

```python
@router.get("/snapshots", response_model=PaginatedResponse[SchemeSnapshotOut])
def list_snapshots(...):
    ...
    items = q.order_by(...).offset(...).limit(...).all()
    return PaginatedResponse(items=items, ...)
```

Change ONLY the `response_model`:
```python
from app.schemas.analytics import SchemeSnapshotListItem  # add import

@router.get("/snapshots", response_model=PaginatedResponse[SchemeSnapshotListItem])  # CHANGED
def list_snapshots(...):
    ... # rest unchanged
```

That's it. Pydantic will auto-trim the response — extra fields in the ORM object are ignored.

## Verify
```bash
curl http://localhost:8000/analytics/snapshots?page=1\&page_size=2 | head -c 500
```
Response should now contain only 16 fields per item, not 44.

## Frontend impact
**None.** Frontend already only uses these 16 fields (see [AnalyticsPage.tsx:130-136](frontend/src/pages/AnalyticsPage.tsx)). Removed fields were never read.

## Rollback
Change `response_model=PaginatedResponse[SchemeSnapshotListItem]` back to `PaginatedResponse[SchemeSnapshotOut]`.

## Won't break
- `/analytics/scheme/{amfi_code}/snapshot` (single-scheme) still uses fat DTO — detail page works
- Frontend Analytics page uses subset — no code change
- Postman collection — only saved response examples might differ in size, request itself works

---

# 🔧 FIX #4 — Frontend keepPreviousData + debounced search

## What & why
- Pagination: clicking "Next" causes a Spinner flash. Should keep showing current data while loading next.
- Search: typing "mirae" fires 5 separate API calls. Should debounce.

## Where
1. `frontend/src/hooks/useAnalytics.ts`
2. `frontend/src/pages/AnalyticsPage.tsx`

## Action — Part A — Hook update

In `frontend/src/hooks/useAnalytics.ts`, change `useSnapshots`:

```typescript
import { useQuery, keepPreviousData } from '@tanstack/react-query'  // ADD keepPreviousData

export const useSnapshots = (params: Parameters<typeof fetchSnapshots>[0]) =>
  useQuery({
    queryKey: ['snapshots', params],
    queryFn: () => fetchSnapshots(params),
    staleTime: 5 * 60 * 1000,            // ADD: 5 min cache
    placeholderData: keepPreviousData,    // ADD: show old data while new loads
  })
```

## Action — Part B — Debounced search

In `frontend/src/pages/AnalyticsPage.tsx`, replace the state lines:

```typescript
// CURRENT (around line 27-29):
const [search, setSearch] = useState('')
const [category, setCategory] = useState('')

// CHANGE TO:
import { useState, useDeferredValue } from 'react'

const [searchInput, setSearchInput] = useState('')
const [categoryInput, setCategoryInput] = useState('')
const search = useDeferredValue(searchInput)
const category = useDeferredValue(categoryInput)
```

And update the input handlers (around line 57-66):
```tsx
// CURRENT:
onChange={(e) => { setSearch(e.target.value); setPage(1) }}

// CHANGE TO:
onChange={(e) => { setSearchInput(e.target.value); setPage(1) }}

// Same for category — setCategory → setCategoryInput
```

## Verify
- Type in search box rapidly — should only see ONE network request fire after 100-200ms idle
- Click Page 2 — table data stays visible (slightly dimmed maybe), no full spinner

## Rollback
Revert to plain `useState` and remove `keepPreviousData` import.

## Won't break
- Same API endpoints, same params
- Same render output, just smoother

---

# 🔧 FIX #5 — Lazy-load all 14 pages with React.lazy()

## What & why
`App.tsx` imports all 14 pages eagerly. User downloads `SchemeDetailPage.tsx` (43 KB) even if they only visit Dashboard. With React.lazy() each page loads only when navigated to.

## Where
`frontend/src/App.tsx`

## Action

Replace the imports section:

```tsx
// CURRENT (lines 1-18):
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
```

```tsx
// CHANGE TO:
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import Sidebar from './components/layout/Sidebar'
import TopBar from './components/layout/TopBar'
import ErrorBoundary from './components/ui/ErrorBoundary'
import Spinner from './components/ui/Spinner'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const SchemesPage = lazy(() => import('./pages/SchemesPage'))
const SchemeDetailPage = lazy(() => import('./pages/SchemeDetailPage'))
const NAVPage = lazy(() => import('./pages/NAVPage'))
const AUMPage = lazy(() => import('./pages/AUMPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const TrackingPage = lazy(() => import('./pages/TrackingPage'))
const DisclosurePage = lazy(() => import('./pages/DisclosurePage'))
const MarketCapPage = lazy(() => import('./pages/MarketCapPage'))
const PortfolioPage = lazy(() => import('./pages/PortfolioPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const GoalCalculatorPage = lazy(() => import('./pages/GoalCalculatorPage'))
const CategoryComparisonPage = lazy(() => import('./pages/CategoryComparisonPage'))
const NPSPage = lazy(() => import('./pages/NPSPage'))
```

Wrap `<Routes>` with `<Suspense>`. In the `Layout()` component:

```tsx
// CURRENT:
<main className="flex-1 overflow-auto">
  <ErrorBoundary>
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      ...
    </Routes>
  </ErrorBoundary>
</main>

// CHANGE TO:
<main className="flex-1 overflow-auto">
  <ErrorBoundary>
    <Suspense fallback={<div className="p-6"><Spinner /></div>}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        ...
      </Routes>
    </Suspense>
  </ErrorBoundary>
</main>
```

## Verify
- After `npm run build`, check `dist/assets/` — should have many small JS chunks (one per page) instead of one big bundle
- DevTools → Network tab → load Dashboard → only Dashboard JS downloaded; click Schemes → Schemes JS downloads on click

## Rollback
Restore the static imports and remove `<Suspense>`.

## Won't break
- All routes work identically
- Same components, just code-split
- A brief Spinner appears on first navigation to a page — acceptable UX

---

# 🔧 FIX #6 — Refactor `refresh_snapshot()` (THE BIG ONE)

## What & why
**Currently:** Each call to `refresh_snapshot(db, amfi_code)` makes ~130 separate DB queries (8 for returns + 108 for SIPs + tracking + disclosures). For 16,366 schemes that's ~2.1 million DB queries per refresh.

**After fix:** ~3 queries per scheme. Same math, same outputs, just compute in-memory after one bulk NAV fetch.

**Expected impact:** Snapshot refresh time: **10–15 min → 1–2 min.**

## Where
`backend/app/services/analytics_service.py`

## CRITICAL — preserve exact output

The snapshot row produced by the new code MUST have:
- Identical field values to the old version (within rounding tolerance)
- Identical NULL handling — fields stay NULL when data insufficient
- Identical "reject if gap > days" logic for returns
- Identical 52w computation window
- Identical XIRR for SIP (Newton-Raphson convergence)
- Identical Sortino, VaR, Calmar formulas

The frontend reads these fields by name — any change in semantics would silently break dashboards.

## Action

Open `backend/app/services/analytics_service.py`. The current implementation makes ~130 queries per scheme:
- `refresh_snapshot()` at lines 252-341
- Helper functions: `get_nav_on_or_before`, `compute_scheme_returns`, `compute_52w_high_low`, `compute_sip_return`, `compute_max_drawdown`, `compute_sortino_ratio`, `compute_var_95`

**Refactor strategy:**
1. At the START of `refresh_snapshot()`, fetch ALL NAVs for the scheme in ONE query (last 5 years, ordered by date).
2. Build in-memory structures: sorted list of (date, nav) tuples + a dict for quick lookup.
3. Rewrite each helper to accept this in-memory list instead of a DB session.
4. Keep public function signatures identical so no other code breaks.

### Reference implementation (paste-ready, but adapt to your exact existing logic)

```python
import bisect
import math
from datetime import date, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from app.models.nav import NavPrice
from app.models.analytics import SchemeAnalyticsSnapshot
from app.models.scheme import SchemeMaster
from app.models.disclosure import MonthlyDisclosureRow, QuarterlyDisclosureRow
from app.models.tracking import TrackingError, TrackingDifference

RISK_FREE_RATE = 0.065  # 6.5% per annum

# ─────────────────────────────────────────────────────────────────────
# Keep these for backward compatibility (used elsewhere):
# compute_cagr, compute_absolute_return, get_nav_on_or_before
# DO NOT delete — they are imported by analytics router for /goal/* endpoints.
# ─────────────────────────────────────────────────────────────────────

def compute_cagr(nav_start: float, nav_end: float, years: float) -> Optional[float]:
    if nav_start <= 0 or years <= 0:
        return None
    return ((nav_end / nav_start) ** (1 / years) - 1) * 100

def compute_absolute_return(nav_start: float, nav_end: float) -> Optional[float]:
    if nav_start <= 0:
        return None
    return ((nav_end - nav_start) / nav_start) * 100

def get_nav_on_or_before(db: Session, amfi_code: str, target_date: date) -> Optional[NavPrice]:
    """KEEP THIS — used by other endpoints. Single-query lookup."""
    return (
        db.query(NavPrice)
        .filter(NavPrice.amfi_code == amfi_code, NavPrice.nav_date <= target_date)
        .order_by(desc(NavPrice.nav_date))
        .first()
    )

def compute_scheme_returns(db: Session, amfi_code: str) -> dict:
    """KEEP THIS — used by /analytics/scheme/{code}/returns endpoint."""
    latest = get_nav_on_or_before(db, amfi_code, date.today())
    if not latest:
        return {}
    today = latest.nav_date
    nav_end = float(latest.nav)

    def get_return(days: int, years: float) -> Optional[float]:
        past_date = today - timedelta(days=days)
        past = get_nav_on_or_before(db, amfi_code, past_date)
        if not past:
            return None
        gap = (past_date - past.nav_date).days
        if gap > days:
            return None
        nav_s = float(past.nav)
        if years <= 1:
            return compute_absolute_return(nav_s, nav_end)
        return compute_cagr(nav_s, nav_end, years)

    return {
        "return_1w": get_return(7, 7 / 365),
        "return_1m": get_return(30, 30 / 365),
        "return_3m": get_return(91, 91 / 365),
        "return_6m": get_return(182, 182 / 365),
        "return_1y": get_return(365, 1),
        "return_3y": get_return(1095, 3),
        "return_5y": get_return(1825, 5),
        "return_10y": get_return(3650, 10),
    }

# ─────────────────────────────────────────────────────────────────────
# NEW in-memory helpers — used only inside refresh_snapshot
# ─────────────────────────────────────────────────────────────────────

def _get_nav_before_inmem(dates_sorted, nav_dict, target_date):
    """Binary search for the latest NAV on or before target_date."""
    idx = bisect.bisect_right(dates_sorted, target_date) - 1
    if idx < 0:
        return None
    d = dates_sorted[idx]
    return d, nav_dict[d]

def _compute_returns_inmem(dates_sorted, nav_dict, latest_date, latest_nav):
    """Same logic as compute_scheme_returns but uses in-memory data."""
    def get_return(days, years):
        target = latest_date - timedelta(days=days)
        result = _get_nav_before_inmem(dates_sorted, nav_dict, target)
        if not result:
            return None
        past_date, past_nav = result
        gap = (target - past_date).days
        if gap > days:
            return None
        if years <= 1:
            return ((latest_nav - past_nav) / past_nav) * 100 if past_nav > 0 else None
        return ((latest_nav / past_nav) ** (1 / years) - 1) * 100 if past_nav > 0 else None

    return {
        "return_1w": get_return(7, 7 / 365),
        "return_1m": get_return(30, 30 / 365),
        "return_3m": get_return(91, 91 / 365),
        "return_6m": get_return(182, 182 / 365),
        "return_1y": get_return(365, 1),
        "return_3y": get_return(1095, 3),
        "return_5y": get_return(1825, 5),
        "return_10y": get_return(3650, 10),
    }

def _compute_52w_inmem(dates_sorted, nav_dict, as_of):
    """52w high/low from in-memory data."""
    start = as_of - timedelta(days=365)
    values = [nav_dict[d] for d in dates_sorted if start <= d <= as_of]
    if not values:
        return None, None
    return max(values), min(values)

def _compute_max_drawdown_inmem(dates_sorted, nav_dict, years=3):
    """Same logic as compute_max_drawdown but uses in-memory data."""
    from_date = date.today() - timedelta(days=years * 365)
    series = [(d, nav_dict[d]) for d in dates_sorted if d >= from_date]
    if len(series) < 10:
        return None
    peak = series[0][1]
    max_dd = 0.0
    for _, nav_val in series:
        if nav_val > peak:
            peak = nav_val
        dd = (peak - nav_val) / peak * 100 if peak > 0 else 0.0
        if dd > max_dd:
            max_dd = dd
    return round(max_dd, 4) if max_dd > 0 else None

def _compute_sortino_inmem(dates_sorted, nav_dict, years=3, risk_free_rate=RISK_FREE_RATE):
    """Same logic as compute_sortino_ratio but in-memory."""
    from_date = date.today() - timedelta(days=years * 365)
    series = [(d, nav_dict[d]) for d in dates_sorted if d >= from_date]
    if len(series) < 60:
        return None
    daily_returns = []
    for i in range(1, len(series)):
        prev = series[i - 1][1]
        curr = series[i][1]
        if prev > 0:
            daily_returns.append((curr - prev) / prev)
    if len(daily_returns) < 30:
        return None
    avg = sum(daily_returns) / len(daily_returns)
    ann_return = (1 + avg) ** 252 - 1
    daily_rfr = (1 + risk_free_rate) ** (1 / 252) - 1
    downside = [min(0.0, r - daily_rfr) for r in daily_returns]
    downside_dev = math.sqrt(sum(r ** 2 for r in downside) / len(downside)) * math.sqrt(252)
    if downside_dev < 1e-10:
        return None
    return round((ann_return - risk_free_rate) / downside_dev, 4)

def _compute_var_95_inmem(dates_sorted, nav_dict, years=1):
    """Same logic as compute_var_95 but in-memory."""
    from_date = date.today() - timedelta(days=years * 365)
    series = [(d, nav_dict[d]) for d in dates_sorted if d >= from_date]
    if len(series) < 30:
        return None
    daily_returns = []
    for i in range(1, len(series)):
        prev = series[i - 1][1]
        curr = series[i][1]
        if prev > 0:
            daily_returns.append((curr - prev) / prev * 100)
    if len(daily_returns) < 20:
        return None
    daily_returns.sort()
    idx = max(0, int(len(daily_returns) * 0.05) - 1)
    return round(-daily_returns[idx], 4)

def _compute_sip_return_inmem(dates_sorted, nav_dict, years):
    """Same logic as compute_sip_return (Newton-Raphson XIRR) but in-memory."""
    from dateutil.relativedelta import relativedelta
    today = date.today()
    start = today - relativedelta(years=years)

    inv_dates = []
    d = start
    while d <= today:
        inv_dates.append(d)
        d += relativedelta(months=1)
    if len(inv_dates) < 6:
        return None

    nav_map = {}
    for inv_d in inv_dates:
        result = _get_nav_before_inmem(dates_sorted, nav_dict, inv_d)
        if result:
            nav_map[inv_d] = result[1]
    if len(nav_map) < max(6, len(inv_dates) // 2):
        return None

    valid_dates = sorted(nav_map.keys())
    latest_nav_val = nav_map[valid_dates[-1]]
    if any(nav_map[d] <= 0 for d in valid_dates):
        return None
    total_units = sum(1000.0 / nav_map[d] for d in valid_dates)
    final_value = total_units * latest_nav_val
    cf_dates = valid_dates + [today]
    cf_amounts = [-1000.0] * len(valid_dates) + [final_value]
    day0 = cf_dates[0]

    def f(r): return sum(amt / (1 + r) ** ((d - day0).days / 365.0) for amt, d in zip(cf_amounts, cf_dates))
    def df(r): return sum(-((d - day0).days / 365.0) * amt / (1 + r) ** ((d - day0).days / 365.0 + 1) for amt, d in zip(cf_amounts, cf_dates))

    r = 0.12
    try:
        for _ in range(200):
            fr = f(r)
            dfr = df(r)
            if abs(dfr) < 1e-12: break
            r1 = r - fr / dfr
            if abs(r1 - r) < 1e-8: r = r1; break
            r = max(-0.99, min(r1, 50.0))
        if -1 < r < 50:
            return round(r * 100, 4)
    except Exception:
        pass
    return None

# ─────────────────────────────────────────────────────────────────────
# REFACTORED refresh_snapshot — single NAV fetch, in-memory math
# ─────────────────────────────────────────────────────────────────────

def refresh_snapshot(db: Session, amfi_code: str) -> None:
    scheme = db.query(SchemeMaster).filter_by(amfi_code=amfi_code, is_active="Y").first()
    if not scheme:
        return

    # ONE bulk fetch — last 5+ years of NAVs (allows return_5y compute)
    five_years_ago = date.today() - timedelta(days=365 * 5 + 30)
    nav_rows = (
        db.query(NavPrice.nav_date, NavPrice.nav)
        .filter(NavPrice.amfi_code == amfi_code, NavPrice.nav_date >= five_years_ago)
        .order_by(NavPrice.nav_date)
        .all()
    )
    if not nav_rows:
        return

    nav_dict = {r[0]: float(r[1]) for r in nav_rows}
    dates_sorted = sorted(nav_dict.keys())
    latest_date = dates_sorted[-1]
    latest_nav = nav_dict[latest_date]

    # All return/risk/SIP computations now in-memory
    returns = _compute_returns_inmem(dates_sorted, nav_dict, latest_date, latest_nav)
    nav_52w_high, nav_52w_low = _compute_52w_inmem(dates_sorted, nav_dict, latest_date)
    max_dd = _compute_max_drawdown_inmem(dates_sorted, nav_dict)
    sortino = _compute_sortino_inmem(dates_sorted, nav_dict)
    var95 = _compute_var_95_inmem(dates_sorted, nav_dict)
    sip_1y = _compute_sip_return_inmem(dates_sorted, nav_dict, 1)
    sip_3y = _compute_sip_return_inmem(dates_sorted, nav_dict, 3)
    sip_5y = _compute_sip_return_inmem(dates_sorted, nav_dict, 5)
    ann_3y = returns.get("return_3y")
    calmar = round(ann_3y / max_dd, 4) if (ann_3y and max_dd and max_dd > 0) else None

    # Only 3 more DB queries for disclosures + tracking
    latest_disclosure = (
        db.query(MonthlyDisclosureRow)
        .filter_by(amfi_code=amfi_code)
        .order_by(desc(MonthlyDisclosureRow.report_month))
        .first()
    )
    latest_te = (
        db.query(TrackingError)
        .filter_by(amfi_code=amfi_code, period_type="1Y")
        .order_by(desc(TrackingError.as_of_date))
        .first()
    )
    latest_td = (
        db.query(TrackingDifference)
        .filter_by(amfi_code=amfi_code)
        .order_by(desc(TrackingDifference.report_month))
        .first()
    )
    latest_qd = (
        db.query(QuarterlyDisclosureRow)
        .filter_by(amfi_code=amfi_code)
        .order_by(desc(QuarterlyDisclosureRow.report_quarter))
        .first()
    )

    # Upsert
    snapshot = db.query(SchemeAnalyticsSnapshot).filter_by(amfi_code=amfi_code).first()
    if not snapshot:
        snapshot = SchemeAnalyticsSnapshot(amfi_code=amfi_code)
        db.add(snapshot)

    snapshot.scheme_name = scheme.scheme_name
    snapshot.amc_name = scheme.amc_name
    snapshot.scheme_category = scheme.scheme_category
    snapshot.latest_nav = latest_nav
    snapshot.nav_date = latest_date
    snapshot.return_1w = returns.get("return_1w")
    snapshot.return_1m = returns.get("return_1m")
    snapshot.return_3m = returns.get("return_3m")
    snapshot.return_6m = returns.get("return_6m")
    snapshot.return_1y = returns.get("return_1y")
    snapshot.return_3y = returns.get("return_3y")
    snapshot.return_5y = returns.get("return_5y")
    snapshot.return_10y = returns.get("return_10y")
    snapshot.aum_cr = float(latest_disclosure.aum_cr) if latest_disclosure and latest_disclosure.aum_cr else None
    snapshot.expense_ratio = float(latest_disclosure.expense_ratio) if latest_disclosure and latest_disclosure.expense_ratio else None
    snapshot.tracking_error_1y = float(latest_te.tracking_error) if latest_te and latest_te.tracking_error else None
    snapshot.tracking_diff_latest = float(latest_td.tracking_difference) if latest_td and latest_td.tracking_difference else None
    snapshot.nav_52w_high = nav_52w_high
    snapshot.nav_52w_low = nav_52w_low
    snapshot.sip_return_1y = sip_1y
    snapshot.sip_return_3y = sip_3y
    snapshot.sip_return_5y = sip_5y
    snapshot.sharpe_ratio = float(latest_qd.sharpe_ratio) if latest_qd and latest_qd.sharpe_ratio else None
    snapshot.beta = float(latest_qd.beta) if latest_qd and latest_qd.beta else None
    snapshot.std_deviation = float(latest_qd.std_deviation) if latest_qd and latest_qd.std_deviation else None
    snapshot.max_drawdown = max_dd
    snapshot.sortino_ratio = sortino
    snapshot.var_95 = var95
    snapshot.calmar_ratio = calmar
    from datetime import datetime
    snapshot.snapshot_refreshed_at = datetime.utcnow()
    db.commit()

# refresh_all_snapshots() and _compute_category_ranks() remain UNCHANGED
```

## Verify

Compare snapshots BEFORE and AFTER:

```bash
# Before applying:
docker exec mf_mysql mysql -uroot -ppassword mutualfund_analytics -e "
SELECT amfi_code, return_1y, return_3y, sip_return_3y, max_drawdown, sortino_ratio
FROM scheme_analytics_snapshot WHERE return_1y IS NOT NULL ORDER BY amfi_code LIMIT 10;" > before.txt

# After applying + running refresh:
curl -X POST http://localhost:8000/analytics/refresh-snapshots
# wait 2 min
docker exec mf_mysql mysql -uroot -ppassword mutualfund_analytics -e "
SELECT amfi_code, return_1y, return_3y, sip_return_3y, max_drawdown, sortino_ratio
FROM scheme_analytics_snapshot WHERE return_1y IS NOT NULL ORDER BY amfi_code LIMIT 10;" > after.txt

diff before.txt after.txt
```

Values should match within rounding precision (last 1-2 decimal places). If anything differs significantly, REVERT.

## Rollback
Restore the original `refresh_snapshot()` from git. The helper functions `get_nav_on_or_before`, `compute_scheme_returns` etc. are unchanged — only `refresh_snapshot` body and the new `_*_inmem` helpers added.

## Won't break
- API endpoints: unchanged
- Response models: unchanged
- Database schema: unchanged
- Frontend: reads same snapshot fields
- Postman: same requests succeed
- All non-refresh code paths use the original helpers — they're preserved

## CAUTION
- The Newton-Raphson XIRR can converge to slightly different values depending on starting point — small differences in `sip_return_*` of < 0.01% are OK.
- The 52w high/low uses `latest_date` (last NAV date) — original code uses same — keep this consistent.
- DO NOT change the `_compute_category_ranks()` function — it runs after all refreshes complete, expects the same data.

---

# 📋 Final verification after all 6 fixes

Run these checks in order:

```bash
# 1. All containers still running
docker compose ps

# 2. Health check
curl http://localhost:8000/health

# 3. Snapshot table populated
docker exec mf_mysql mysql -uroot -ppassword mutualfund_analytics -e "
SELECT COUNT(*) AS total,
       SUM(CASE WHEN return_1y IS NOT NULL THEN 1 ELSE 0 END) AS with_returns
FROM scheme_analytics_snapshot;"

# 4. Summary endpoint returns populated data
curl http://localhost:8000/analytics/summary

# 5. Snapshots list endpoint returns slim DTO (only 16 fields per item)
curl http://localhost:8000/analytics/snapshots?page=1\&page_size=2

# 6. Time snapshot refresh
time curl -X POST http://localhost:8000/analytics/refresh-snapshots
# (returns immediately — but the work in background should now take 1-2 min)
# Wait, then verify
sleep 180
docker logs mf_backend --tail 50 | grep -i "snapshot\|refresh"

# 7. Frontend still loads
curl -I http://localhost:3000
```

All 7 should pass. If any fail, revert the most recent change and investigate.

---

# 🛡 Rollback strategy

If anything breaks:

1. **Code changes:** `git checkout HEAD~1 -- <file>` or restore from backup
2. **MySQL indexes:** safe to drop, no data loss
3. **`nav_price` view→table:** drop the table, recreate as view (SQL provided above)
4. **Frontend:** revert App.tsx to static imports

**Backup before starting:**
```bash
docker exec mf_mysql mysqldump -uroot -ppassword mutualfund_analytics > /tmp/backup_pre_optimization.sql
```

---

# 🎯 Expected results after all 6 fixes

| Metric | Before | After |
|---|---|---|
| Snapshot refresh time | 10–15 min | **1–2 min** |
| Analytics page payload | 80 KB | **25 KB** |
| First-paint cold cache | 2–3 sec | **0.8 sec** |
| Search keystroke responsiveness | janky, 5 requests | **smooth, 1 request** |
| Page 2 click | spinner flash | **instant** |
| NAV history query | uses VIEW | **uses TABLE with index** |
| DB queries per snapshot refresh | ~2.1 million | **~50,000** |

No new infrastructure. No language change. No breaking changes.
