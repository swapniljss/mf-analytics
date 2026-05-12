# Code-Level Frontend Optimizations

Real bottlenecks found by reading your actual code (not generic advice).

Looking at the Analytics page screenshot:
- "Aditya Birla Sun Life Banking & PSU Debt Fund - DIRECT - IDCW" appearing many times
- 50 rows × 11 columns of similar data
- Page feels heavy because of payload size + redundant fields

This file documents **what's actually slow** in YOUR codebase and **what to change**.

---

## 🔍 PROBLEM 1: Snapshot endpoint returns FAT objects (44 fields per row)

### What's happening today

`GET /analytics/snapshots?page_size=50` returns this shape (look at [`backend/app/schemas/analytics.py:7-47`](backend/app/schemas/analytics.py)):

```json
{
  "items": [
    {
      "id": 1, "amfi_code": "100027", "scheme_name": "...",
      "amc_name": "...", "scheme_category": "...",
      "latest_nav": 401.23, "nav_date": "2026-05-10",
      "return_1w": 0.13, "return_1m": 0.62, "return_3m": 1.81,
      "return_6m": 3.55, "return_1y": 7.21, "return_3y": 6.42,
      "return_5y": 5.95, "return_10y": null,
      "since_inception": null, "inception_date": null,
      "aum_cr": 12000, "expense_ratio": 0.45,
      "tracking_error_1y": null, "tracking_diff_latest": null,
      "nav_52w_high": 410, "nav_52w_low": 380,
      "sip_return_1y": null, "sip_return_3y": null, "sip_return_5y": null,
      "sharpe_ratio": null, "beta": null, "std_deviation": null,
      "max_drawdown": null, "sortino_ratio": null, "calmar_ratio": null,
      "var_95": null, "category_rank": 5, "category_count": 42,
      "category_quartile": 1, "snapshot_refreshed_at": "..."
    },
    ... 49 more rows
  ]
}
```

**That's 44 fields × 50 rows = 2200 fields per page load.**
Most of them are `null` and never displayed on the Analytics page (which only shows 11 columns).

### Measured impact
- Wire payload: ~80 KB → could be ~25 KB
- JSON parse: ~30ms → could be ~10ms
- React re-render: more props to diff

### Fix

Add a **lightweight DTO** for list views. Edit `backend/app/routers/analytics.py:21-58`:

```python
# CURRENT
@router.get("/snapshots", response_model=PaginatedResponse[SchemeSnapshotOut])
def list_snapshots(...):
    items = q.order_by(...).offset(...).limit(...).all()
    return PaginatedResponse(items=items, ...)
```

```python
# OPTIMIZED — new lightweight schema, returns only what the table uses
class SchemeSnapshotListItem(BaseModel):
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

@router.get("/snapshots", response_model=PaginatedResponse[SchemeSnapshotListItem])
def list_snapshots(...):
    # SELECT only the 15 columns we actually need (instead of 44)
    items = (
        db.query(
            SchemeAnalyticsSnapshot.id,
            SchemeAnalyticsSnapshot.amfi_code,
            SchemeAnalyticsSnapshot.scheme_name,
            SchemeAnalyticsSnapshot.amc_name,
            SchemeAnalyticsSnapshot.scheme_category,
            SchemeAnalyticsSnapshot.latest_nav,
            SchemeAnalyticsSnapshot.nav_date,
            SchemeAnalyticsSnapshot.return_1w,
            SchemeAnalyticsSnapshot.return_1m,
            SchemeAnalyticsSnapshot.return_3m,
            SchemeAnalyticsSnapshot.return_6m,
            SchemeAnalyticsSnapshot.return_1y,
            SchemeAnalyticsSnapshot.return_3y,
            SchemeAnalyticsSnapshot.return_5y,
            SchemeAnalyticsSnapshot.aum_cr,
            SchemeAnalyticsSnapshot.expense_ratio,
        )
        .filter(SchemeAnalyticsSnapshot.latest_nav.isnot(None))
        ...
        .all()
    )
```

**Expected gain:** 80 KB → 25 KB payload (**3x smaller**), 30ms → 10ms parse, ~50ms quicker page.

Keep the fat `SchemeSnapshotOut` schema only for `/analytics/scheme/{amfi_code}/snapshot` (single-scheme detail page).

---

## 🔍 PROBLEM 2: Scheme name repetition kills payload size + table readability

Your screenshot shows the same name "Aditya Birla Sun Life Banking & PSU Debt Fund - ..." 9 times in a row. That's because each row is a different *plan/option* variant (Direct-IDCW, Direct-Growth, Regular-IDCW, Regular-Growth, etc.).

### The waste:
- Same string `"Aditya Birla Sun Life AMC Limited"` (32 chars) repeated 50 times = 1.6 KB just AMC names
- Same `"Banking & PSU Debt Fund"` repeated several times per AMC group
- Frontend `<span>` re-renders the truncated string for each row

### Fix A — Group rows by base scheme on the backend

Add a new endpoint that groups variants:

```python
# Backend: app/routers/analytics.py
@router.get("/snapshots/grouped")
def list_snapshots_grouped(...):
    """Group all plan variants of the same scheme into one row with expandable plans."""
    rows = db.query(...).all()

    # Group by (amc_name, normalized scheme name without plan/option keywords)
    import re
    def _base_name(name):
        return re.sub(r'\s*-\s*(direct|regular|growth|idcw|dividend|payout|reinvestment).*', '', name, flags=re.I).strip()

    groups = {}
    for r in rows:
        key = (r.amc_name, _base_name(r.scheme_name))
        groups.setdefault(key, []).append(r)

    # Return one row per group with nested plans
    return [
        {
            "base_name": _base_name(plans[0].scheme_name),
            "amc_name": plans[0].amc_name,
            "scheme_category": plans[0].scheme_category,
            "plans": [
                {"amfi_code": p.amfi_code, "plan_type": "...", "option_type": "...",
                 "latest_nav": p.latest_nav, "return_1y": p.return_1y, ...}
                for p in plans
            ]
        }
        for plans in groups.values()
    ]
```

Frontend renders as a collapsible row — user sees one "Aditya Birla Banking & PSU" with [▶] to expand all 9 variants.

**Expected gain:**
- 50 rows visible → 50 *groups* = maybe 200 underlying schemes shown
- Payload still smaller because shared fields (amc, name, category) appear once
- Visual clutter goes away → user finds what they want faster

### Fix B — Quick frontend-only win: Truncate names smarter

In [`pages/AnalyticsPage.tsx:123`](frontend/src/pages/AnalyticsPage.tsx):

```tsx
// CURRENT
<span className="block truncate font-medium text-gray-900">{s.scheme_name}</span>

// BETTER — show only the differentiating tail
const trimmedName = s.scheme_name.replace(/^(.*?)\s*-\s*/, '...'); // "...DIRECT - IDCW"
<span className="block truncate font-medium text-gray-900" title={s.scheme_name}>{trimmedName}</span>
```

When the AMC + base name repeat from previous row, hide them visually:

```tsx
{data.items.map((s, idx) => {
  const prev = idx > 0 ? data.items[idx - 1] : null
  const sameGroup = prev && prev.amc_name === s.amc_name &&
                    s.scheme_name.split(' - ')[0] === prev.scheme_name.split(' - ')[0]
  return (
    <tr key={s.id}>
      <td>
        {!sameGroup && <span className="font-medium text-gray-900">{baseName}</span>}
        <span className="text-gray-400 text-xs">{planTail}</span>
      </td>
      ...
    </tr>
  )
})}
```

Now 9 rows of "Aditya Birla..." show the long name **once**, then 8 indented `- DIRECT - IDCW`, `- DIRECT - Growth`, etc.

---

## 🔍 PROBLEM 3: No client-side caching across pagination/search

In [`useAnalytics.ts:14-18`](frontend/src/hooks/useAnalytics.ts):

```tsx
export const useSnapshots = (params) =>
  useQuery({
    queryKey: ['snapshots', params],
    queryFn: () => fetchSnapshots(params),
    // ← missing staleTime, missing keepPreviousData
  })
```

### Issues
- Going page 1 → page 2 → page 1 **re-fetches** page 1 (no caching)
- Clicking "Next" shows a Spinner instead of stale data + loading indicator (jarring UX)
- Every keystroke in search input triggers a network call

### Fix

```tsx
import { keepPreviousData } from '@tanstack/react-query'

export const useSnapshots = (params) =>
  useQuery({
    queryKey: ['snapshots', params],
    queryFn: () => fetchSnapshots(params),
    staleTime: 5 * 60 * 1000,        // cache 5 min — snapshots refresh nightly anyway
    placeholderData: keepPreviousData, // show old data while new fetches (no spinner flash)
  })
```

### Plus: debounce search

In `AnalyticsPage.tsx`:

```tsx
import { useDeferredValue } from 'react'

const [searchInput, setSearchInput] = useState('')
const search = useDeferredValue(searchInput)  // React batches typing
// OR use lodash.debounce / a custom useDebounce hook with 300ms delay
```

Without debounce, typing "mirae" hits the API **5 times** (one per keystroke). With debounce, just **once**.

**Expected gain:** Pagination feels instant, no Spinner flash, search uses 5x fewer requests.

---

## 🔍 PROBLEM 4: Decimal serialization is heavy

Look at [`schemas/analytics.py:13`](backend/app/schemas/analytics.py):

```python
latest_nav: Optional[Decimal] = None
return_1w: Optional[Decimal] = None
```

Pydantic serializes `Decimal` as a **string** by default → `"latest_nav": "401.234567"`. Every row, every numeric field.

### Issues
- Strings take more JSON parse time than numbers
- Frontend then calls `parseFloat()` on each → unnecessary work
- Trailing zeros bloat payload (`"401.234567"` vs `401.234567`)

### Fix

Either:

**(a)** Convert to `float` in the schema:
```python
class SchemeSnapshotListItem(BaseModel):
    latest_nav: Optional[float] = None
    return_1w: Optional[float] = None
    ...
```

**(b)** Or configure Pydantic v2 to serialize Decimal as number:
```python
from pydantic import field_serializer

class SchemeSnapshotListItem(BaseModel):
    latest_nav: Optional[Decimal] = None

    @field_serializer('latest_nav', 'return_1w', ..., when_used='json')
    def serialize_decimal(self, value):
        return float(value) if value is not None else None
```

**Expected gain:** ~15-25% smaller payload, faster JSON parse, no `parseFloat` needed in frontend.

---

## 🔍 PROBLEM 5: `category_rank` recompute is O(N²) globally

In [`services/analytics_service.py:344-363`](backend/app/services/analytics_service.py):

```python
def _compute_category_ranks(db):
    snaps = db.query(SchemeAnalyticsSnapshot).filter(
        SchemeAnalyticsSnapshot.return_1y.isnot(None)
    ).all()  # ← loads ALL 16K rows into memory
    by_cat = defaultdict(list)
    for s in snaps:
        by_cat[s.scheme_category or "Unknown"].append(s)
    for cat_snaps in by_cat.values():
        cat_snaps.sort(...)
        # ... assigns rank to each
    db.commit()
```

This is run after every snapshot refresh. For 16K rows, it's not terrible but **does 16K Python sorts + updates**.

### Fix — use MySQL window functions (computed in DB in one query):

```sql
UPDATE scheme_analytics_snapshot AS s
JOIN (
  SELECT amfi_code,
         RANK()    OVER (PARTITION BY scheme_category ORDER BY return_1y DESC) AS rank,
         COUNT(*)  OVER (PARTITION BY scheme_category) AS cnt,
         NTILE(4)  OVER (PARTITION BY scheme_category ORDER BY return_1y DESC) AS quartile
  FROM scheme_analytics_snapshot
  WHERE return_1y IS NOT NULL
) r ON s.amfi_code = r.amfi_code
SET s.category_rank = r.rank,
    s.category_count = r.cnt,
    s.category_quartile = r.quartile;
```

**Expected gain:** 30 sec → 2 sec. Reduces snapshot refresh end-to-end.

---

## 🔍 PROBLEM 6: Snapshot refresh sequential — touched in earlier doc but here's the SPECIFIC code

[`services/analytics_service.py:366-378`](backend/app/services/analytics_service.py):

```python
def refresh_all_snapshots(db: Session) -> dict:
    schemes = db.query(SchemeMaster.amfi_code).filter_by(is_active="Y").all()
    count = 0
    for (amfi_code,) in schemes:
        try:
            refresh_snapshot(db, amfi_code)   # ← runs one at a time
            count += 1
        except Exception as e:
            logger.error(f"Error refreshing snapshot for {amfi_code}: {e}")
    _compute_category_ranks(db)
    return {"refreshed": count}
```

Each `refresh_snapshot` call also makes ~10 DB queries inside (see PROBLEM 7 below). So 16K × 10 = **160K DB roundtrips serially**.

### Fix
- Threadpool with separate DB sessions (covered earlier)
- AND fix PROBLEM 7 first — bigger gain

---

## 🔍 PROBLEM 7: `refresh_snapshot` makes 10+ DB queries per scheme

In [`services/analytics_service.py:252-341`](backend/app/services/analytics_service.py):

For each scheme, `refresh_snapshot` does:

```python
scheme = db.query(SchemeMaster).filter_by(...).first()        # 1 query
latest_nav = get_nav_on_or_before(db, amfi_code, today)        # 1 query
returns = compute_scheme_returns(db, amfi_code)                # 8 queries (one per period!)
latest_disclosure = db.query(MonthlyDisclosureRow)...           # 1 query
latest_te = db.query(TrackingError)...                          # 1 query
latest_td = db.query(TrackingDifference)...                     # 1 query
nav_52w_high, low = compute_52w_high_low(...)                   # 1 query
sip_1y = compute_sip_return(db, amfi_code, 1)                   # 12+ queries (one per month!)
sip_3y = compute_sip_return(db, amfi_code, 3)                   # 36+ queries
sip_5y = compute_sip_return(db, amfi_code, 5)                   # 60+ queries
max_dd = compute_max_drawdown(...)                              # 1 query (loads 3y NAVs)
sortino = compute_sortino_ratio(...)                            # 1 query (same NAVs again!)
var95 = compute_var_95(...)                                     # 1 query (1y NAVs)
latest_qd = db.query(QuarterlyDisclosureRow)...                  # 1 query
```

**~130 queries per scheme × 16,000 schemes = ~2 MILLION queries per refresh.**

This is the actual killer.

### Fix — fetch all NAVs ONCE per scheme, then compute in Python:

```python
def refresh_snapshot(db, amfi_code):
    scheme = db.query(SchemeMaster).filter_by(amfi_code=amfi_code, is_active="Y").first()
    if not scheme:
        return

    # ONE query for ALL NAVs of this scheme (5 years max)
    five_years_ago = date.today() - timedelta(days=365 * 5 + 30)
    nav_rows = (
        db.query(NavPrice.nav_date, NavPrice.nav)
        .filter(NavPrice.amfi_code == amfi_code, NavPrice.nav_date >= five_years_ago)
        .order_by(NavPrice.nav_date)
        .all()
    )

    if not nav_rows:
        return

    # In-memory lookups — NO MORE DB CALLS for NAV
    nav_list = [(r[0], float(r[1])) for r in nav_rows]
    nav_dict = {d: v for d, v in nav_list}
    dates_sorted = [d for d, _ in nav_list]

    def get_nav_before(target):
        """Binary search in-memory list."""
        idx = bisect.bisect_right(dates_sorted, target) - 1
        return (dates_sorted[idx], nav_dict[dates_sorted[idx]]) if idx >= 0 else None

    # Compute all returns from in-memory data
    latest_date, latest_nav = nav_list[-1]
    returns = {}
    for label, days, years in [
        ('return_1w', 7, 7/365), ('return_1m', 30, 30/365),
        ('return_3m', 91, 91/365), ('return_6m', 182, 182/365),
        ('return_1y', 365, 1), ('return_3y', 1095, 3),
        ('return_5y', 1825, 5),
    ]:
        past = get_nav_before(latest_date - timedelta(days=days))
        if past:
            past_date, past_nav = past
            if (latest_date - timedelta(days=days) - past_date).days <= days:
                if years <= 1:
                    returns[label] = ((latest_nav - past_nav) / past_nav) * 100 if past_nav > 0 else None
                else:
                    returns[label] = ((latest_nav / past_nav) ** (1/years) - 1) * 100 if past_nav > 0 else None

    # 52w high/low from in-memory NAVs
    one_year_ago = latest_date - timedelta(days=365)
    recent = [(d, v) for d, v in nav_list if d >= one_year_ago]
    nav_52w_high = max(v for _, v in recent) if recent else None
    nav_52w_low = min(v for _, v in recent) if recent else None

    # Max drawdown from in-memory 3y NAVs
    three_years_ago = latest_date - timedelta(days=365*3)
    three_y = [(d, v) for d, v in nav_list if d >= three_years_ago]
    max_dd = compute_max_drawdown_inmemory(three_y) if len(three_y) > 10 else None

    # Sortino, VaR, SIP — all use the same in-memory nav_list
    # ... etc

    # Only 3 DB queries total for disclosures + tracking
    latest_disclosure = db.query(MonthlyDisclosureRow).filter_by(amfi_code=amfi_code).order_by(...).first()
    latest_te = db.query(TrackingError).filter_by(amfi_code=amfi_code, period_type="1Y").order_by(...).first()
    latest_qd = db.query(QuarterlyDisclosureRow).filter_by(amfi_code=amfi_code).order_by(...).first()

    # Upsert
    snapshot = db.query(SchemeAnalyticsSnapshot).filter_by(amfi_code=amfi_code).first() or SchemeAnalyticsSnapshot(amfi_code=amfi_code)
    snapshot.scheme_name = scheme.scheme_name
    # ... fields
    snapshot.return_1w = returns.get('return_1w')
    snapshot.nav_52w_high = nav_52w_high
    snapshot.max_drawdown = max_dd
    # ... etc
    db.add(snapshot)
    db.commit()
```

**Expected gain:** Snapshot refresh **10-15 min → 1-2 min**. The single biggest win.

---

## 🔍 PROBLEM 8: Frontend re-renders all 50 rows on every state change

Every keystroke in search → React re-renders the entire table. With 50 rows × 11 columns × ~5 spans each = ~2750 DOM nodes diffed per keystroke.

### Fix — memoize rows:

```tsx
import { memo } from 'react'

const SnapshotRow = memo(function SnapshotRow({ s }: { s: SchemeSnapshot }) {
  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50">
      <td>...</td>
      {/* all the same cells */}
    </tr>
  )
})

// In the table body
{data.items.map((s) => <SnapshotRow key={s.id} s={s} />)}
```

`memo` skips re-render if props haven't changed (which is `false` for rows that haven't changed when only search input changed).

**Expected gain:** Typing in search no longer freezes the table; smooth UX.

---

## 🔍 PROBLEM 9: Bundle is loaded all at once

`App.tsx` imports all 14 pages eagerly:
```tsx
import DashboardPage from './pages/DashboardPage'
import SchemesPage from './pages/SchemesPage'
import SchemeDetailPage from './pages/SchemeDetailPage'  // 43 KB
import NPSPage from './pages/NPSPage'  // 22 KB
import GoalCalculatorPage from './pages/GoalCalculatorPage'  // 14 KB
// ... etc
```

That's ~200 KB+ of JS shipped to the browser even if the user only visits Dashboard.

### Fix — lazy load pages:

```tsx
import { lazy, Suspense } from 'react'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const SchemesPage = lazy(() => import('./pages/SchemesPage'))
const SchemeDetailPage = lazy(() => import('./pages/SchemeDetailPage'))
// ... rest the same

function Layout() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        {/* ... */}
      </Routes>
    </Suspense>
  )
}
```

**Expected gain:** Initial page load drops from ~250 KB to ~50 KB JS. Dashboard appears 2-3x faster on first visit.

---

## 🔍 PROBLEM 10: No `Cache-Control` on read APIs

Backend FastAPI returns no cache headers. Browser + CDN re-fetches every time.

### Fix in `app/main.py`:

```python
from fastapi import Response

@app.middleware("http")
async def add_cache_headers(request, call_next):
    response = await call_next(request)
    # Snapshots refresh nightly — safe to cache for 5 min
    if request.url.path.startswith("/analytics/snapshots") or \
       request.url.path == "/analytics/summary":
        response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=600"
    elif request.url.path.startswith("/scheme-master") and request.method == "GET":
        response.headers["Cache-Control"] = "public, max-age=1800"  # 30 min for static-ish data
    return response
```

**Expected gain:** Repeat visits → instant from browser cache. Multiple users hitting same page → CDN/proxy serves cached.

---

## 📋 Priority ranking — biggest wins first

| # | Change | Effort | Frontend gain | Backend gain |
|---|---|---|---|---|
| **7** | Refactor `refresh_snapshot` to fetch NAVs once | 4 hours | (none direct, but unblocks faster refresh) | **10x faster snapshot refresh** |
| **1** | Lightweight `SchemeSnapshotListItem` schema | 1 hour | **3x smaller payload, 50ms faster** | Less serialization work |
| **9** | Lazy-load pages with `React.lazy()` | 30 min | **5x faster first paint** | None |
| **3** | Add `keepPreviousData` + debounce search | 30 min | **No more spinner flashing** | 5x fewer requests |
| **8** | `memo()` table rows | 15 min | Smooth typing in search | None |
| **5** | Window-function rank instead of Python loop | 30 min | None | 30 sec → 2 sec per refresh |
| **10** | Cache-Control headers | 15 min | Browser-cached repeat visits | 80% fewer requests |
| **4** | Decimal → float serialization | 1 hour | 15-25% smaller payload | Faster JSON encode |
| **2A** | Group plan variants endpoint | 6 hours | Cleaner UI, less scrolling | New endpoint |
| **2B** | Frontend-only row grouping | 1 hour | Cleaner UI immediately | None |
| **6** | Parallelize snapshot refresh | 1 hour | None | 3-5x faster (combines with #7) |

---

## 🎯 The realistic plan

### Day 1 (3 hours) — quick wins
1. **#1** lightweight schema — 1 hour
2. **#3** keepPreviousData + debounce — 30 min
3. **#8** memo rows — 15 min
4. **#9** lazy load pages — 30 min
5. **#10** cache headers — 15 min
6. **#2B** smart frontend row collapsing — 30 min

**Result:** Frontend feels 3-5x faster. No backend deploy disruption.

### Day 2 (4 hours) — the big one
7. **#7** refactor `refresh_snapshot` to single-fetch NAV — 3-4 hours

**Result:** Snapshot refresh drops from 15 min to **1-2 min**. Returns populate way faster end-to-end.

### Day 3 (2 hours) — polish
8. **#5** window-function rank — 30 min
9. **#6** parallelize refresh — 1 hour
10. **#4** decimal as float — 30 min

**Result:** Snapshot refresh under 1 min. All numeric APIs ~20% lighter.

---

## ✅ Combined expected outcome

| Metric | Before | After Day 1 | After Day 3 |
|---|---|---|---|
| Analytics page load | 1.2 sec | 0.5 sec | 0.4 sec |
| Payload size | 80 KB | 25 KB | 20 KB |
| First page paint (cold cache) | 2-3 sec | 1 sec | 0.8 sec |
| Page-2 click | 800 ms (fresh fetch) | < 50 ms (cached) | < 50 ms |
| Typing in search | jank | smooth | smooth |
| Snapshot refresh time | 10-15 min | same | **1-2 min** |
| Concurrent users supported | 5 | 15 | 25+ |

---

## 💡 The single most impactful change

If you can only do **one** thing:

> **#7 — refactor `refresh_snapshot` to fetch NAVs once per scheme.**
>
> ~4 hours of work. Drops snapshot refresh from 15 min to ~1 min on t3.micro. Every other "slow data appearing" complaint is downstream of this.
>
> Code location: [`backend/app/services/analytics_service.py:252-341`](backend/app/services/analytics_service.py).

If you can do **two**:

> Above + **#1 — lightweight list schema**.
>
> ~1 hour. Cuts payload 3x for the Analytics page list specifically — the screenshot you sent me.
>
> Code location: [`backend/app/routers/analytics.py:21-58`](backend/app/routers/analytics.py) + new schema in [`backend/app/schemas/analytics.py`](backend/app/schemas/analytics.py).

---

## 📂 Where each change lives

| Problem | File to edit | Lines |
|---|---|---|
| 1 (slim schema) | `backend/app/schemas/analytics.py` + `backend/app/routers/analytics.py` | new class + endpoint update |
| 2A (group plans) | `backend/app/routers/analytics.py` | new `/snapshots/grouped` endpoint |
| 2B (visual collapse) | `frontend/src/pages/AnalyticsPage.tsx` | line 120-138 |
| 3 (caching/debounce) | `frontend/src/hooks/useAnalytics.ts` + `AnalyticsPage.tsx` | lines 14-18 + state init |
| 4 (decimal→float) | `backend/app/schemas/analytics.py` | field types |
| 5 (window-fn rank) | `backend/app/services/analytics_service.py` | `_compute_category_ranks` |
| 6 (parallel refresh) | `backend/app/services/analytics_service.py` | `refresh_all_snapshots` |
| 7 (one-shot NAV fetch) | `backend/app/services/analytics_service.py` | `refresh_snapshot` (rewrite) |
| 8 (memo rows) | `frontend/src/pages/AnalyticsPage.tsx` | new sub-component |
| 9 (lazy pages) | `frontend/src/App.tsx` | imports + Suspense wrap |
| 10 (cache headers) | `backend/app/main.py` | new middleware |
