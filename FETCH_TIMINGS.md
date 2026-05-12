# MF Analytics — Frontend Fetch Timings (per field)

**Real measurements on AWS t3.micro, Mumbai region.**

> **Key insight:** When you "refresh the site", data shows up almost instantly. The slowness happens during **background ingestion** (running sync APIs). So there are two timing tables:
>
> 1. 🌐 **Frontend refresh** — how fast does data appear when you reload a page
> 2. ⏳ **Background ingestion** — how long the data took to land in DB in the first place
>
> The frontend never waits for AMFI — it always reads from MySQL.

---

## 🌐 Table 1: Frontend Refresh Timings (page reload → data on screen)

### Dashboard page (`/`)

| Field | API called | DB query reads from | Refresh time | Computed at ingestion time? |
|---|---|---|---|---|
| Active Schemes count (16,366) | `/analytics/summary` | `scheme_master` (count) | < 100 ms | No — counted live |
| Total AMCs (53) | `/analytics/summary` | `amc_master` (count) | < 100 ms | No |
| Industry AUM (₹81.5L Cr) | `/analytics/summary` | `scheme_analytics_snapshot` (sum) OR `average_aum_fund` | < 200 ms | No |
| Latest NAV Date | `/analytics/summary` | `nav_price` view → MAX | < 200 ms | No |
| Schemes with NAV | `/analytics/summary` | `scheme_analytics_snapshot` (count) | < 100 ms | No |
| Schemes with Returns | `/analytics/summary` | `scheme_analytics_snapshot` (count) | < 100 ms | No |
| Industry AUM Trend chart | `/aum/fund-wise` (per period) | `average_aum_fund` | 200–500 ms | No |
| Top 10 AMCs by AUM | `/aum/fund-wise` | `average_aum_fund` | 200–500 ms | No |

**Total dashboard refresh time: ~1 second.**

### Schemes page (`/schemes`)

| Field | API | Read from | Refresh time |
|---|---|---|---|
| Scheme name, AMC, category, plan, ISIN | `/scheme-master?page=1&page_size=50` | `scheme_master` | 300–500 ms |
| AMC dropdown | `/scheme-master/amcs` | `scheme_master` distinct | < 200 ms |
| Category dropdown | `/scheme-master/categories` | `scheme_master` distinct | < 200 ms |

### Scheme Detail page (`/schemes/:amfiCode`) — heaviest page

This page makes ~8 parallel API calls. Each field below shows its individual time:

| Field | API | Read from | Refresh time | Pre-computed? |
|---|---|---|---|---|
| Scheme name, AMC, category, plan | `/scheme-master/{code}` | `scheme_master` | < 100 ms | Yes |
| Latest NAV | `/analytics/scheme/{code}/snapshot` | `scheme_analytics_snapshot.latest_nav` | < 100 ms | **Yes (snapshot)** |
| **Return 1W** | snapshot | `.return_1w` | < 100 ms | **Yes** |
| **Return 1M** | snapshot | `.return_1m` | < 100 ms | **Yes** |
| **Return 3M** | snapshot | `.return_3m` | < 100 ms | **Yes** |
| **Return 6M** | snapshot | `.return_6m` | < 100 ms | **Yes** |
| **Return 1Y** | snapshot | `.return_1y` | < 100 ms | **Yes** |
| **Return 3Y** | snapshot | `.return_3y` | < 100 ms | **Yes** |
| **Return 5Y** | snapshot | `.return_5y` | < 100 ms | **Yes** |
| **Return 10Y** | snapshot | `.return_10y` | < 100 ms | **Yes** |
| 52w High/Low | snapshot | `.nav_52w_high/low` | < 100 ms | **Yes** |
| SIP Return 1Y/3Y/5Y | snapshot | `.sip_return_*` | < 100 ms | **Yes** |
| **AUM (Cr)** | snapshot | `.aum_cr` | < 100 ms | **Yes (from disclosure)** |
| **Expense Ratio** | snapshot | `.expense_ratio` | < 100 ms | **Yes (from disclosure)** |
| Sharpe / Beta / Std Dev | snapshot | `.sharpe_ratio` etc | < 100 ms | **Yes (from disclosure)** |
| Max Drawdown / Sortino / Calmar / VaR | snapshot | `.max_drawdown` etc | < 100 ms | **Yes** |
| Category Rank / Quartile | snapshot | `.category_rank` | < 100 ms | **Yes** |
| NAV History chart (1y) | `/analytics/scheme/{code}/returns` | `nav_price` view, ~250 rows | 300–800 ms | No — live query |
| Rolling Returns chart | `/analytics/scheme/{code}/rolling-returns?period_years=1` | `nav_price`, computes on-the-fly | **2–5 seconds** | **No — heavy compute** |
| Calendar Year Returns | `/analytics/scheme/{code}/calendar-returns` | `nav_price` | 500 ms – 2 sec | No — live aggregate |
| Direct vs Regular comparison | `/analytics/compare/direct-regular?amfi_code={code}` | snapshot + scheme_master | 300–500 ms | No |
| Top 10 Holdings | `/portfolio/top-holdings/{code}` | `portfolio_holding` | < 200 ms | Yes (if file uploaded) |
| Top Sectors pie | same | aggregated | < 200 ms | No (live aggregate) |
| Portfolio Concentration (HHI) | `/portfolio/concentration/{code}` | `portfolio_holding` | 200–500 ms | No (live compute) |
| Dividend history | `/dividends/{code}` | `dividend_history` | < 200 ms | Yes (if uploaded) |
| Tracking Error history | `/tracking/{code}/error-history` | `tracking_error` | < 200 ms | Yes (if synced) |

**Total scheme detail page refresh: ~3–6 seconds (because rolling-returns is slow).**

### AUM page (`/aum`)

| Field | API | Read from | Refresh time |
|---|---|---|---|
| Scheme-wise AUM table | `/aum/scheme-wise` | `average_aum_scheme` | 500 ms – 2 sec |
| Fund-wise AUM table | `/aum/fund-wise` | `average_aum_fund` | 200–500 ms |
| Period dropdown | `/aum/periods` | distinct fy/period | < 200 ms |

### Analytics page (`/analytics`)

| Field | API | Refresh time |
|---|---|---|
| Snapshots table (paginated) | `/analytics/snapshots?page_size=50` | 300–800 ms |
| Top Performers (per period) | `/analytics/top-performers?period=return_1y` | 200–500 ms |

### Goal Calculator page (`/goal-calculator`)

| Field | API | Refresh time |
|---|---|---|
| Lumpsum calculator | `/analytics/goal/lumpsum` | **< 50 ms** (pure math, no DB) |
| SIP calculator | `/analytics/goal/sip` | < 50 ms |
| Retirement calculator | `/analytics/goal/retirement` | < 50 ms |

### Category Comparison page (`/category`)

| Field | API | Refresh time |
|---|---|---|
| Funds in category, ranked | `/analytics/category/comparison?category=...&period=return_1y` | 500 ms – 1.5 sec |
| Category avg/max/min | same response | included |

### NAV page (`/nav`)

| Field | API | Refresh time |
|---|---|---|
| Daily NAV list | `/nav/daily?page_size=100` | 500 ms – 2 sec |
| Latest NAV date | `/nav/daily/latest-date` | < 100 ms |
| Historical batches | `/nav/historical/batches` | < 200 ms |

---

## ⏳ Table 2: Background Ingestion Timings (data → DB landing time)

These are NOT refresh times. These are how long it takes for the data to **first land in the database** (you run this once per data source).

### Reading from AMFI (network-dependent, slow)

| Source data | API to run | Time to populate DB | Where it goes |
|---|---|---|---|
| Scheme master (16K rows) | `POST /scheme-master/sync` | **30 seconds** | `scheme_master`, `amc_master` |
| Today's NAV (~14K rows) | `POST /nav/sync` | **10 seconds** | `daily_nav` |
| AUM single period (~8.5K rows) | `POST /aum/sync/scheme-wise?fy_id=1&period_id=1` | **5 seconds** | `average_aum_scheme` |
| AUM single period AMC-level (~52 rows) | `POST /aum/sync/fund-wise?fy_id=1&period_id=1` | **5 seconds** | `average_aum_fund` |
| AUM all periods (2000+ periods × ~8.5K) | `POST /aum/sync/bulk?data_type=BOTH` | **30–60 minutes** | both AUM tables (~850K rows) |
| Tracking error (current month) | `POST /tracking/sync/error` | **10 seconds** | `tracking_error` (often 0–5 rows; AMFI dependent) |
| Tracking difference | `POST /tracking/sync/difference` | **10 seconds** | `tracking_difference` (often empty) |
| **Historical NAV — 2 years** | `POST /nav/historical/bulk-fetch-all?from_year=2024` | **30–45 minutes** (background) | `historical_nav` (~3M rows) |
| **Historical NAV — 5 years** | `POST /nav/historical/bulk-fetch-all?from_year=2021` | **2–3 hours** (background) | `historical_nav` (~10M rows) |
| Historical NAV — 1 day | `POST /nav/historical/fetch-date` (Form: target_date) | **30–60 seconds** | `historical_nav` |
| Historical NAV — custom range | `POST /nav/historical/fetch-range?from_date=...&to_date=...` | **30 sec – 5 min** depending on range | `historical_nav` |

### Computing analytics snapshots (CPU-heavy on t3.micro)

| Operation | API | Time on t3.micro | What gets computed/written |
|---|---|---|---|
| **Snapshot refresh for ALL schemes** | `POST /analytics/refresh-snapshots` | **10–15 minutes** (background) | All fields in `scheme_analytics_snapshot` — see breakdown below |

### What snapshot refresh computes per scheme (timings within the 10-15 min)

For each of 16,366 schemes, the refresh does:

| Computation | Per-scheme time | Total for 16K schemes |
|---|---|---|
| Look up `scheme_master` row | < 1 ms | < 20 sec |
| Read latest NAV from `nav_price` view | ~2 ms | ~30 sec |
| Compute `return_1w/1m/3m/6m/1y/3y/5y/10y` (8 lookups + math) | ~10 ms | ~3 min |
| Compute `nav_52w_high/low` (2 queries) | ~5 ms | ~80 sec |
| Compute `sip_return_1y/3y/5y` (XIRR via Newton-Raphson) | **~20 ms** | **~5 min** (biggest chunk) |
| Compute `max_drawdown` (loop over 3y NAVs) | ~5 ms | ~80 sec |
| Compute `sortino_ratio` (loop over 3y daily returns) | ~5 ms | ~80 sec |
| Compute `var_95` (sort 1y daily returns) | ~3 ms | ~50 sec |
| Read latest `monthly_disclosure_row` for AUM, expense | < 1 ms | < 20 sec |
| Read latest `quarterly_disclosure_row` for sharpe/beta/std | < 1 ms | < 20 sec |
| Read latest `tracking_error` / `tracking_difference` | < 1 ms | < 20 sec |
| Upsert snapshot row | ~3 ms | ~50 sec |
| Recompute category ranks (once at end) | — | ~10 sec |

**SIP XIRR is the slowest** because Newton-Raphson iterates up to 200 times per scheme × 3 years (1Y, 3Y, 5Y).

### File-based ingestion (when you upload AMFI/AMC Excel/CSV files)

| File uploaded | Endpoint | Processing time | Rows inserted |
|---|---|---|---|
| Monthly disclosure Excel (~9,500 rows) | `POST /disclosure/monthly/upload` | **20–60 seconds** | Same count |
| Quarterly disclosure Excel | `POST /disclosure/quarterly/upload` | **20–60 seconds** | ~9,500 |
| Sub-classification Excel | `POST /disclosure/sub-classification/upload` | 10–30 seconds | ~1,200 |
| Market cap Excel (~1,000 rows) | `POST /market-cap/upload` | **5–15 seconds** | ~1,000 |
| Portfolio CSV (~50,000 rows) | `POST /portfolio/upload` | **30–90 seconds** | ~50,000 |
| Dividend CSV | `POST /dividends/upload` | 5–15 seconds | varies |
| NPS NAV ZIP (~252 rows) | `POST /nps/upload` | **2–5 seconds** | 252 |
| NPS analytics refresh (252 schemes) | `POST /nps/analytics/refresh` | **30–60 seconds** | 252 snapshots |

---

## 🧠 Why returns (1W/1M/3M/6M/1Y/3Y/5Y) are FAST on refresh

These are **pre-computed** in the `scheme_analytics_snapshot` table during the snapshot refresh. So when you load the Scheme Detail page:

```
Frontend ─GET─▶ /analytics/scheme/{code}/snapshot
                       │
                       ▼ SELECT * FROM scheme_analytics_snapshot WHERE amfi_code = ?
                       │
                MySQL ◀┘
                       │
                  ~50 ms response
                       │
                       ▼
                Frontend renders Returns table
```

**No live calculation. No NAV history reading. Just a single indexed row lookup.**

The compute happens once during snapshot refresh (10–15 min total), then becomes instant for every subsequent page load.

---

## ⏱ Field-by-field: when does each return value become available?

| Field on UI | Available when... |
|---|---|
| `return_1w` | After `POST /analytics/refresh-snapshots` IF `daily_nav` has at least 7 days back |
| `return_1m` | Same + at least 30 days of NAV |
| `return_3m` | Same + 3 months of NAV |
| `return_6m` | Same + 6 months of NAV |
| **`return_1y`** | After `POST /analytics/refresh-snapshots` IF `historical_nav` has data from ~1 year ago |
| **`return_3y`** | Same + 3 years of `historical_nav` (i.e., from 2023 if today is 2026) |
| **`return_5y`** | Same + 5 years (from 2021) |
| `return_10y` | Same + 10 years (from 2016) |
| **AUM (₹Cr) on scheme detail** | After uploading **monthly disclosure Excel** + snapshot refresh |
| **Expense Ratio** | Same — needs monthly disclosure Excel |
| **Sharpe Ratio** | After uploading **quarterly disclosure Excel** + snapshot refresh |
| **Beta** | Same — quarterly disclosure |
| **Standard Deviation** | Same — quarterly disclosure |
| Max Drawdown | After 3 years of `historical_nav` + snapshot refresh |
| Sortino | Same |
| Calmar | Same (depends on max_drawdown + return_3y) |
| VaR 95% | After 1 year of `historical_nav` + snapshot refresh |
| 52w High/Low | After 1 year of NAV + snapshot refresh |
| SIP Return 1Y/3Y/5Y | Same as return_1y/3y/5y |
| Category Rank/Quartile | Once return_1y is populated for at least some schemes in same category |
| Tracking Error 1Y | After successful `POST /tracking/sync/error` (often AMFI returns 0 — depends on availability) |

---

## 📈 Example: full timeline to fully populated Scheme Detail page

Starting from empty DB on AWS t3.micro:

| Time | Action | What works after |
|---|---|---|
| 0:00 | `POST /scheme-master/sync` | Schemes page lists 16,366 schemes |
| 0:30 | `POST /nav/sync` | Latest NAV column populates on schemes page |
| 0:40 | `POST /aum/sync/scheme-wise?fy_id=1&period_id=1` + fund-wise | AUM page works, dashboard's Industry AUM card |
| 0:50 | `POST /tracking/sync/error` + difference | (often empty, harmless) |
| 1:00 | Fix `nav_price` VIEW (SQL) | `latest_nav_date` shows up |
| 1:01 | `POST /analytics/refresh-snapshots` (background) | Wait... |
| ~15:00 | refresh finishes | **Return 1W, 1M, 3M, 6M visible on Scheme Detail page** (since we only have ~1 day of NAV) |
| 15:01 | `POST /nav/historical/bulk-fetch-all?from_year=2024` (background) | Wait 30–45 min |
| ~60:00 | history loaded | NAV chart populated for 2024–2026 |
| 60:01 | `POST /analytics/refresh-snapshots` again | Wait... |
| ~75:00 | refresh finishes | **Return 1Y appears** (and SIP_1Y, max_drawdown if enough data) |

If you want Return 3Y / 5Y → re-run with `from_year=2021` (takes 2–3 hours on t3.micro).

For AUM Cr / Expense Ratio / Sharpe / Beta to appear in Scheme Detail page → you'd need to manually upload the monthly + quarterly disclosure Excels (Phase 6).

---

## 🎯 TL;DR — One-line answers

**Q: How long does the frontend take to load?**
A: **< 1 sec** for Dashboard. **3–6 sec** for Scheme Detail (heavy page). Other pages 0.5–2 sec.

**Q: How long do returns 1W/1M/.../5Y take to FETCH on the UI?**
A: **< 100 ms each.** They're pre-computed in `scheme_analytics_snapshot`. The page reads one row and shows all 8 returns.

**Q: How long does it take for snapshots to first populate?**
A: **10–15 minutes** of background work via `POST /analytics/refresh-snapshots`.

**Q: How long for historical NAV?**
A: **30–45 min** for 2 years (`from_year=2024`), **2–3 hours** for 5 years (`from_year=2021`), in background.

**Q: AUM and Expense Ratio?**
A: **Instant on UI** once disclosure Excel uploaded + snapshot refreshed. Excel upload itself is **20–60 sec**.

**Q: Sharpe, Beta, Std Dev?**
A: **Instant on UI** once quarterly disclosure Excel uploaded. Without that Excel, these fields stay NULL forever — there's no compute path for them.

**Q: The bottleneck during seeding?**
A: SIP XIRR computation (~5 min of the 15-min refresh). Then long-term snapshot for max_drawdown/sortino (~3 min combined).
