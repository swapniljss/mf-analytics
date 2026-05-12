# PROJECT_IDENTITY

```yaml
project_name: Mutual Fund Analytics
project_type: Full-stack data analytics platform (read-heavy, ingest-heavy)
business_domain: Indian mutual fund / NPS / APY data — AMFI ingestion, NAV history, AUM, returns, risk, portfolio holdings, market-cap categorization
architecture_style: 3-tier monolith — React SPA → FastAPI REST → MySQL 8 (containerised via Docker Compose)
frontend_stack: React 18 + TypeScript + Vite + TailwindCSS + react-router-dom v6 + @tanstack/react-query v5 + axios + recharts + lucide-react
backend_stack: Python 3.13, FastAPI 0.115, SQLAlchemy 2.0, PyMySQL, Pydantic v2, APScheduler, Pandas/openpyxl/xlrd, requests, rapidfuzz, alembic
db_stack: MySQL 8.0 (utf8mb4_unicode_ci, STRICT_TRANS_TABLES). Migrations managed via Alembic + SQLAlchemy create_all bootstrap on startup.
auth_type: NONE — no auth/login/users/RBAC/JWT/sessions exist. CORS-only network boundary. All endpoints are public.
deployment_type: docker-compose (mysql:8.0 + backend:fastapi + frontend:nginx). Backend has Dockerfile; frontend builds via Vite then served by nginx (port 3000) reverse-proxying /api/ → backend:8000.
primary_features:
  - AMFI scheme master sync (~ daily NAV + historical NAV by-date / by-range / bulk quarterly seeding from 2021)
  - AUM scheme-wise + fund-wise sync (fyId 1-100 × periodId 1-20)
  - Excel/CSV upload pipelines: monthly disclosure, sub-classification, quarterly disclosure, market-cap categorization, portfolio holdings, dividend history
  - Pre-computed analytics snapshots: returns 1W..10Y, CAGR, SIP XIRR, 52w hi/lo, sharpe/beta/std, sortino, calmar, max-drawdown, VaR95, category quartile/rank
  - Tracking error / tracking difference sync from AMFI
  - Goal calculators: lumpsum, SIP (with step-up), retirement
  - Direct-vs-Regular plan comparison, Category comparison, Rolling/Calendar returns
  - Portfolio analytics: top holdings/sectors, overlap-between-schemes, HHI concentration
  - NPS / APY full pipeline (10 PFMs, ~252 schemes, daily NAV ZIP ingestion + per-scheme analytics snapshots)
  - Admin observability: file logs, rejected rows, background jobs, reconciliation issues
important_integrations:
  - AMFI portal (portal.amfiindia.com / www.amfiindia.com) — scheme master, daily NAV, historical NAV ranges, AUM JSON APIs, tracking error/diff JSON APIs
  - NPS Trust ZIP files (NAV_File_DDMMYYYY.zip) uploaded manually
  - APScheduler (in-process, BackgroundScheduler, Asia/Kolkata)
```

---

# HIGH_LEVEL_FLOW

```
USER FLOW (read):
Browser → /api/<route> (vite-proxy:5173 OR nginx:3000) → FastAPI router → service → SQLAlchemy → MySQL
                                                                       ↘ Pydantic schema (response_model)

INGEST FLOW (sync):
APScheduler / POST endpoint → service.fetch_*() → utils.http_client.HTTP_SESSION.get(AMFI_URL)
   → parsers.<x>_parser.parse_*() → service._upsert_*() (INSERT … ON DUPLICATE KEY UPDATE) → MySQL

UPLOAD FLOW (excel/csv/zip):
Browser FormData → POST /<module>/upload → utils.file_utils.save_upload() (./uploads/) → parsers.parse_*()
   → service.process_*() → DB upsert → MessageResponse

ANALYTICS COMPUTE FLOW:
POST /analytics/refresh-snapshots (BackgroundTasks) → refresh_all_snapshots(db)
   → for each active SchemeMaster: refresh_snapshot() reads NavPrice (view) + Disclosures + TrackingError → write SchemeAnalyticsSnapshot
   → _compute_category_ranks() → updates category_rank/quartile

NAV READ FLOW:
get_nav_history() queries `nav_price` VIEW (transparent union of daily_nav + historical_nav)

NPS FLOW:
ZIP upload → parsers/nps_parser.parse_nps_zip() → upsert PFM/Scheme/NAV → POST /nps/analytics/refresh → NPSAnalyticsSnapshot

AUTH FLOW: ABSENT.
PAYMENT FLOW: ABSENT.
SESSION/TOKEN: ABSENT.
```

---

# REPOSITORY_STRUCTURE

```
NEWMUTUALFUNDANALYTICS/                 (root — wraps duplicate-named inner dir from zip extraction)
└── NEWMUTUALFUNDANALYTICS/             (actual project root)
    ├── docker-compose.yml              # 3 services: mysql, backend, frontend
    ├── setup.sh                        # bootstrap script
    ├── MutualFundAnalytics.postman_collection.json
    ├── nps_bulk_loader.log
    ├── mysql-init/01_init.sql          # creates DB w/ utf8mb4
    ├── memory/                         # AI memory dir (used by tooling, not app)
    ├── backend/
    │   ├── Dockerfile
    │   ├── run.py                      # uvicorn entry: app.main:app --host 0.0.0.0 --port 8000
    │   ├── requirements.txt
    │   ├── .env / .env.example         # DATABASE_URL, CORS_ORIGINS, etc.
    │   ├── alembic.ini, alembic/env.py
    │   ├── alembic/versions/           # 5 migrations (analytics+portfolio, advanced metrics, dividends, market-cap update, fof_aum_cr)
    │   ├── uploads/                    # runtime upload dir (volume-mounted in compose)
    │   └── app/
    │       ├── main.py                 # FastAPI app, CORS, lifespan(create_all + scheduler), 11 routers, /health, /health/db
    │       ├── config.py               # pydantic-settings: DATABASE_URL, SECRET_KEY (unused), UPLOAD_DIR, LOG_LEVEL, CORS_ORIGINS
    │       ├── database.py             # SQLAlchemy engine (pool_size=10, recycle=3600), utf8mb4 + STRICT_TRANS_TABLES on connect
    │       ├── jobs/scheduler.py       # APScheduler cron jobs (4 jobs)
    │       ├── models/                 # SQLAlchemy ORM (24 tables across 9 modules)
    │       ├── schemas/                # Pydantic v2 response/input schemas
    │       ├── routers/                # FastAPI APIRouters (11 modules)
    │       ├── services/               # business logic & ingest (10 modules)
    │       ├── parsers/                # AMFI/NPS/Excel parsers (9 modules)
    │       └── utils/                  # date_utils, file_utils, http_client (retry session), pandas_utils
    └── frontend/
        ├── Dockerfile, nginx.conf      # nginx :3000 → /api/ proxies to backend:8000
        ├── package.json                # vite, react, react-router-dom, react-query, axios, recharts, tailwind
        ├── vite.config.ts              # dev :5173, /api → http://localhost:8000 (rewrite removes /api)
        ├── tailwind.config.ts, tsconfig.json, postcss.config.js, index.html
        └── src/
            ├── main.tsx                # ReactDOM render → QueryClientProvider(staleTime=5min, retry=2) → App
            ├── App.tsx                 # BrowserRouter + Layout(Sidebar+TopBar+ErrorBoundary) + 14 Routes
            ├── index.css               # tailwind directives
            ├── api/                    # axios wrappers per domain (analytics, aum, nav, schemes, tracking, client)
            ├── components/
            │   ├── cards/KPICard.tsx
            │   ├── charts/             # AUMTrendChart, CategoryPieChart, NAVLineChart, ReturnsBarChart (recharts)
            │   ├── layout/             # Sidebar (13 nav items), TopBar
            │   ├── ui/                 # Badge, EmptyState, ErrorBoundary, Spinner
            │   ├── forms/  (empty)
            │   └── tables/ (empty)
            ├── config/constants.ts     # API_BASE_URL='/api', PAGINATION_DEFAULTS, CHART_COLORS, RETURN_PERIODS, MARKET_CAP_BUCKETS
            ├── hooks/                  # useAUM, useAnalytics, useSchemes (react-query wrappers)
            ├── pages/                  # 14 page components
            ├── types/index.ts          # All shared TS interfaces
            └── utils/formatters.ts
```

## Key file purposes (compact)

```
backend/app/main.py                  → FastAPI bootstrap, CORS, lifespan(create_all + scheduler), router registration
backend/app/database.py              → engine + SessionLocal + get_db() generator + utf8mb4/strict-mode pragmas
backend/app/config.py                → Settings(DATABASE_URL, CORS_ORIGINS, UPLOAD_DIR, LOG_LEVEL, SECRET_KEY[unused])
backend/app/jobs/scheduler.py        → APScheduler: scheme_master(weekly Sun 2AM), daily_nav(09:30 IST), tracking(5th 6AM), snapshot(01:00)
backend/app/utils/http_client.py     → shared requests.Session w/ retry (3, backoff=1, [429,5xx]) + browser UA
backend/app/utils/date_utils.py      → get_trading_date_for_nav, parse_amfi_date, get_ist_now
backend/app/utils/file_utils.py      → save_upload(content, filename) → ./uploads/
backend/app/utils/pandas_utils.py    → read_excel_first_sheet, df_to_records, safe_numeric

frontend/src/main.tsx                → React 18 root + QueryClientProvider
frontend/src/App.tsx                 → routes table + Sidebar+TopBar layout, ErrorBoundary
frontend/src/api/client.ts           → axios instance (baseURL=/api), error interceptor flattens detail→message
frontend/src/config/constants.ts     → API_BASE_URL='/api'
```

---

# FRONTEND_ARCHITECTURE

## Routing map (14 routes — all public)

```
/                       DashboardPage           — KPI summary, latest NAV date, total schemes/AMCs/AUM
/schemes                SchemesPage             — list + filters (search/amc/category/plan_type)
/schemes/:amfiCode      SchemeDetailPage        — full scheme analytics (largest page, 43KB)
/nav                    NAVPage                 — daily NAV table + sync trigger
/aum                    AUMPage                 — scheme-wise / fund-wise tabs
/analytics              AnalyticsPage           — snapshots table, top performers
/goal-calculator        GoalCalculatorPage      — lumpsum / SIP / retirement
/category               CategoryComparisonPage  — peers in a category by period
/tracking               TrackingPage            — TE / TD listings
/disclosure             DisclosurePage          — monthly + sub-classification + quarterly upload UI
/portfolio              PortfolioPage           — holdings, sectors, overlap, concentration
/market-cap             MarketCapPage           — large/mid/small bucket lists, upload
/nps                    NPSPage                 — NPS/APY analytics, ZIP upload (single + bulk)
/admin                  AdminPage               — file logs, jobs, reconciliation
```

## Layout / hierarchy

```
<BrowserRouter>
 └─ <Layout>
     ├─ <Sidebar>            13 NavLinks (Dashboard … Admin) lucide-react icons
     ├─ <TopBar title=… />    title resolved via PAGE_TITLES map by longest-prefix match
     └─ <main><ErrorBoundary><Routes>… 14 routes …</Routes></ErrorBoundary></main>
```

## State management

```
SERVER STATE  → @tanstack/react-query v5  (defaults: staleTime=5min, retry=2)
LOCAL STATE   → React useState/useEffect inside pages
GLOBAL STATE  → NONE (no Redux / Zustand / Context-based store; only QueryClient context)
URL STATE     → react-router-dom v6 useParams / useSearchParams
```

## API handling

```
all calls   → axios via src/api/client.ts (baseURL='/api', interceptor unwraps error.response.data.detail)
domain split→ src/api/{analytics,aum,nav,schemes,tracking}.ts
react-query → src/hooks/{useAUM,useAnalytics,useSchemes}.ts wrap select endpoints; many pages call apiClient directly
proxy       → vite.config.ts dev: /api → http://localhost:8000 (rewrites /api prefix off); prod: nginx /api/ → backend:8000/
```

## Auth handling / Protected routes / Forms / Validations
```
Auth handling     → ABSENT
Protected routes  → ABSENT (all routes anonymous)
Forms             → controlled inputs + native HTML validation; FormData for uploads (file + report_month)
Validations       → minimal client-side (regex YYYY-MM for portfolio month). Real validation done server-side via Pydantic + HTTPException(422)
```

## Reusable systems / UI

```
UI primitives → components/ui/{Badge,EmptyState,ErrorBoundary,Spinner}
KPICard       → components/cards/KPICard.tsx
Charts        → components/charts/{AUMTrendChart,CategoryPieChart,NAVLineChart,ReturnsBarChart} (recharts)
Layout        → components/layout/{Sidebar,TopBar}
Icon library  → lucide-react
Styling       → TailwindCSS (no component lib). Sidebar colors hardcoded gray-900/blue-600
Constants     → CHART_COLORS[10], RETURN_PERIODS[8 keys], MARKET_CAP_BUCKETS[3]
forms/, tables/ folders are EMPTY (mtime 2024-04-08) — not yet populated
```

## Environment variables (frontend)
```
NONE injected at runtime. API_BASE_URL hardcoded to '/api' (constants.ts). All frontend env routing happens via vite/nginx proxies.
```

## Component flow example

```
SchemeDetailPage (43KB)
 ├─ useParams(amfiCode)
 ├─ apiClient.get(/scheme-master/{code})        → SchemeMaster
 ├─ apiClient.get(/analytics/scheme/{code}/snapshot)   → SchemeSnapshot
 ├─ apiClient.get(/analytics/scheme/{code}/returns)    → SchemeReturns + nav_history
 ├─ apiClient.get(/analytics/scheme/{code}/rolling-returns)
 ├─ apiClient.get(/analytics/scheme/{code}/calendar-returns)
 ├─ apiClient.get(/analytics/compare/direct-regular?amfi_code=…)
 ├─ apiClient.get(/portfolio/top-holdings/{code})
 ├─ apiClient.get(/portfolio/concentration/{code})
 ├─ apiClient.get(/dividends/{code}) + /dividends/{code}/summary
 ├─ apiClient.get(/tracking/{code}/error-history) + /difference-history
 └─ Renders → KPICard grid + NAVLineChart + ReturnsBarChart + holdings table + sector pie
```

---

# BACKEND_ARCHITECTURE

## Server entry

```
run.py → uvicorn.run("app.main:app", host="0.0.0.0", port=8000)
app.main:app → FastAPI(lifespan=lifespan) with @asynccontextmanager:
   on_startup  → Base.metadata.create_all(engine); start_scheduler()
   on_shutdown → stop_scheduler()
```

## Middleware chain

```
Request → CORSMiddleware(allow_origins=cors_origins_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
        → APIRouter (per-module)
        → Route handler (Depends(get_db) yields SQLAlchemy Session, auto-closed in finally)
        → response_model=PydanticSchema (validation + serialization)
        → JSON
```

NO custom auth/logging/rate-limit/error middleware. FastAPI default exception handlers.

## Router registration

```
app.include_router(scheme_master.router)   # /scheme-master   tag="Scheme Master"
app.include_router(nav.router)             # /nav             tag="NAV"
app.include_router(aum.router)             # /aum             tag="AUM"
app.include_router(analytics.router)       # /analytics       tag="Analytics"
app.include_router(tracking.router)        # /tracking        tag="Tracking"
app.include_router(disclosure.router)      # /disclosure      tag="Disclosure"
app.include_router(market_cap.router)      # /market-cap      tag="Market Cap"
app.include_router(admin.router)           # /admin           tag="Admin"
app.include_router(portfolio_router)       # /portfolio       tag="Portfolio"
app.include_router(dividend_router)        # /dividends       tag="Dividends"
app.include_router(nps_router)             # /nps             tag="NPS / APY"
+ GET /health, GET /health/db (top-level)
```

## Request lifecycle (typical GET)

```
Client → ASGI → FastAPI → CORSMiddleware → APIRouter.match → Depends(get_db)
       → handler → q = db.query(Model).filter(...).offset/limit → total/items
       → return PaginatedResponse[Schema](items=…) → Pydantic→JSON → response
```

## Request lifecycle (upload)

```
Client → multipart/form-data (UploadFile + Form fields)
       → handler: content = await file.read(); save_upload(content, filename) → /uploads/<file>
       → service.process_*(db, file_path, …) → parser.parse_*(file_path) → for record: db.add(Model(**)) → db.commit()
       → MessageResponse(message=…, detail=str(result))
```

## Background / scheduled tasks

```
APScheduler (Asia/Kolkata, BackgroundScheduler, in-process):
  scheme_master_sync   CronTrigger(week='*/4', day_of_week='sun', hour=2)   → fetch_and_sync_scheme_master
  daily_nav_sync       CronTrigger(hour=9,  minute=30)                       → fetch_daily_nav
  tracking_sync        CronTrigger(day=5,  hour=6,  minute=0)                → sync_tracking_error + sync_tracking_difference
  snapshot_refresh     CronTrigger(hour=1, minute=0)                         → refresh_all_snapshots

FastAPI BackgroundTasks (per-request fire-and-forget, returns 200 immediately):
  POST /analytics/refresh-snapshots   → bg refresh_all_snapshots
  POST /nav/historical/bulk-fetch-all → bg bulk_fetch_nav_history(quarter-by-quarter)
  POST /nav/historical/fetch-from-url → bg fetch_historical_nav_from_url
```

## Validation layer

```
Pydantic v2 schemas (app/schemas/*.py): SchemeMasterOut, AmcMasterOut, DailyNAVOut, NavPriceOut,
  HistoricalNAVBatchOut, AumSchemeOut, AumFundOut, AumSyncLogOut, SchemeSnapshotOut, SchemeReturnsOut,
  NAVDataPoint, TopPerformerOut, TrackingErrorOut, TrackingDifferenceOut, TrackingSyncLogOut,
  PfmOut, SchemeOut, NavPointOut, UploadResult, SnapshotOut, RefreshResult,
  FileLogOut, BackgroundJobOut, ReconciliationIssueOut,
  PaginatedResponse[T] (generic), MessageResponse.
Inline BaseModel in routers/scheme_master.py: SchemePatch (writeable subset of SchemeMaster).
HTTPException(404, 422) raised explicitly for not-found / parse errors.
```

## Data access layer

```
DB session  → app.database.SessionLocal (sessionmaker, autocommit=False, autoflush=False)
Get session → app.database.get_db() generator (Depends in routes)
Pool config → pool_size=10, max_overflow=20, pool_recycle=3600s, pool_pre_ping=True, connect_timeout=30
Per-conn   → SET NAMES utf8mb4 + sql_mode=STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO

Hot upserts use raw SQL via sqlalchemy.text:
  daily_nav     → INSERT … ON DUPLICATE KEY UPDATE on (amfi_code, nav_date)
  historical_nav→ INSERT … ON DUPLICATE KEY UPDATE on (amfi_code, nav_date)
  nps_pfm/scheme/nav → ON DUPLICATE KEY UPDATE on natural keys
nav_price is a VIEW (not a table) over daily_nav UNION historical_nav (per service comments).
```

---

# API_INDEX

> Format: METHOD | ENDPOINT | AUTH | REQUEST | RESPONSE | HANDLER | USED_IN
> AUTH is `NO` for ALL endpoints (no auth layer exists).

## Health
```
GET  /health           NO  -                                 {status:"ok"}                                  main.health_check                main.tsx (none — devops only)
GET  /health/db        NO  -                                 {status,database,mysql_version}                main.db_health                   -
```

## Scheme Master
```
GET   /scheme-master                NO  ?search&amc_name&category&plan_type&is_active&page&page_size      PaginatedResponse[SchemeMasterOut]   scheme_master.list_schemes        SchemesPage / api/schemes.fetchSchemes
GET   /scheme-master/amcs           NO  -                                                                List[str] (amc names)                scheme_master.list_amcs            api/schemes.fetchAmcList
GET   /scheme-master/categories     NO  -                                                                List[str]                            scheme_master.list_categories      api/schemes.fetchCategories
GET   /scheme-master/{amfi_code}    NO  path                                                              SchemeMasterOut (404)                scheme_master.get_scheme           SchemeDetailPage / fetchScheme
PATCH /scheme-master/{amfi_code}    NO  SchemePatch JSON                                                  MessageResponse (404)                scheme_master.patch_scheme         (manual edit)
POST  /scheme-master/sync           NO  -                                                                MessageResponse                       scheme_master.trigger_sync         AdminPage
GET   /scheme-master/amc-master/list NO ?search&page&page_size                                            PaginatedResponse[AmcMasterOut]      scheme_master.list_amc_master      AdminPage
```

## NAV
```
GET   /nav/daily                       NO  ?search&amfi_code&nav_date&page&page_size       PaginatedResponse[DailyNAVOut]    nav.list_daily_nav                NAVPage / api/nav.fetchDailyNav
GET   /nav/daily/latest-date           NO  -                                              {latest_nav_date:string|null}     nav.get_latest_nav_date           DashboardPage / api/nav.fetchLatestNavDate
POST  /nav/sync                        NO  -                                              MessageResponse                   nav.trigger_daily_nav_sync         NAVPage / api/nav.triggerDailyNavSync
GET   /nav/{amfi_code}/history         NO  ?from_date&to_date                              List[NavPriceOut]                 nav.get_scheme_nav_history         SchemeDetailPage / api/nav.fetchNavHistory
GET   /nav/historical/batches          NO  ?page&page_size                                 PaginatedResponse[HistoricalNAVBatchOut] nav.list_historical_batches NAVPage / fetchHistoricalBatches
POST  /nav/historical/fetch-date       NO  Form(target_date)                              MessageResponse                   nav.fetch_historical_for_date      NAVPage
POST  /nav/historical/bulk-fetch-all   NO  ?from_year=2021&to_year                         MessageResponse (bg task)         nav.trigger_bulk_nav_history       NAVPage
POST  /nav/historical/fetch-from-url   NO  ?url&batch_name                                 MessageResponse (bg task)         nav.fetch_nav_from_url             NAVPage
POST  /nav/historical/fetch-range      NO  ?from_date&to_date                              MessageResponse                   nav.fetch_historical_nav_for_range NAVPage
POST  /nav/historical/upload           NO  multipart(file,batch_name)                     MessageResponse                   nav.upload_historical_nav_file     NAVPage
```

## AUM
```
GET   /aum/scheme-wise        NO  ?fy_id&period_id&amc_name&category&search&page&page_size   PaginatedResponse[AumSchemeOut]   aum.list_aum_scheme            AUMPage / api/aum.fetchAumSchemewise
GET   /aum/fund-wise          NO  ?fy_id&period_id&search&page&page_size                     PaginatedResponse[AumFundOut]     aum.list_aum_fund               AUMPage / fetchAumFundwise
GET   /aum/periods            NO  -                                                          List[{fy_id,period_id,fy_label,period_label}] aum.list_aum_periods AUMPage / fetchAumPeriods
GET   /aum/sync-logs          NO  ?limit                                                     List[AumSyncLogOut]               aum.list_sync_logs              AdminPage
POST  /aum/sync/scheme-wise   NO  ?fy_id&period_id                                            MessageResponse                   aum.trigger_scheme_wise_sync   AUMPage / triggerAumSync
POST  /aum/sync/fund-wise     NO  ?fy_id&period_id                                            MessageResponse                   aum.trigger_fund_wise_sync     AUMPage
POST  /aum/sync/bulk          NO  ?data_type=BOTH|SCHEME_WISE|FUND_WISE                       MessageResponse (long)            aum.trigger_bulk_sync          AUMPage
```

## Analytics
```
GET   /analytics/snapshots                            NO  ?search&amc_name&category&has_returns&page&page_size  PaginatedResponse[SchemeSnapshotOut]  analytics.list_snapshots                 AnalyticsPage / fetchSnapshots
GET   /analytics/scheme/{amfi_code}/snapshot          NO  -                                                     SchemeSnapshotOut|null                analytics.get_scheme_snapshot            SchemeDetailPage / fetchSchemeSnapshot
GET   /analytics/scheme/{amfi_code}/returns           NO  ?from_date&to_date                                    SchemeReturnsOut(+nav_history)        analytics.get_scheme_returns             SchemeDetailPage / fetchSchemeReturns
GET   /analytics/scheme/{amfi_code}/rolling-returns   NO  ?period_years (0.5..10)                              {period_years,data_points,min,max,mean,median,positive_pct,gt_8_pct,gt_12_pct,series} analytics.rolling_returns SchemeDetailPage
GET   /analytics/scheme/{amfi_code}/calendar-returns  NO  -                                                     {amfi_code,years:[{year,return}]}     analytics.calendar_year_returns          SchemeDetailPage
GET   /analytics/top-performers                       NO  ?category&period=return_(1w..10y)&limit              List[TopPerformerOut]                  analytics.top_performers                 DashboardPage / fetchTopPerformers
POST  /analytics/refresh-snapshots                    NO  -                                                     {status,message} bg task               analytics.trigger_snapshot_refresh       AdminPage / triggerSnapshotRefresh
GET   /analytics/summary                              NO  -                                                     {total_active_schemes,total_amcs,latest_nav_date,total_industry_aum_cr,schemes_with_nav,schemes_with_returns,data_status:{has_nav,has_returns,needs_history_sync}} analytics.get_dashboard_summary DashboardPage / fetchDashboardSummary
GET   /analytics/category/comparison                  NO  ?category&period&page&page_size                       {category,period,total,category_avg,category_max,category_min,page,page_size,items[…rank,quartile…]} analytics.category_comparison CategoryComparisonPage
GET   /analytics/compare/direct-regular               NO  ?amfi_code                                            {available,direct,regular,expense_gap,return_gap_1y,compounding_impact_10y_per_lakh} analytics.compare_direct_regular SchemeDetailPage
GET   /analytics/goal/lumpsum                         NO  ?amount&rate&years&inflation&tax_rate                 {future_value,total_gain,tax_on_gains,post_tax_value,inflation_adjusted_value,wealth_ratio} analytics.goal_lumpsum GoalCalculatorPage
GET   /analytics/goal/sip                             NO  ?monthly_amount&rate&years&step_up                    {total_invested,future_value,total_gain,wealth_ratio} analytics.goal_sip                          GoalCalculatorPage
GET   /analytics/goal/retirement                      NO  ?current_age&retirement_age&monthly_expense&corpus_years&expected_return&post_return&inflation {years_to_retire,future_monthly_expense_at_retirement,corpus_needed,monthly_sip_needed,corpus_lasts_years} analytics.goal_retirement GoalCalculatorPage
```

## Tracking
```
GET   /tracking/error                          NO  ?amfi_code&amc_name&period_type&as_of_date&page&page_size   PaginatedResponse[TrackingErrorOut]      tracking.list_tracking_error          TrackingPage / fetchTrackingError
GET   /tracking/difference                     NO  ?amfi_code&amc_name&report_month&page&page_size              PaginatedResponse[TrackingDifferenceOut] tracking.list_tracking_difference     TrackingPage / fetchTrackingDifference
GET   /tracking/{amfi_code}/error-history      NO  -                                                            List[TrackingErrorOut]                   tracking.get_error_history            SchemeDetailPage / fetchTrackingErrorHistory
GET   /tracking/{amfi_code}/difference-history NO  -                                                            List[TrackingDifferenceOut]              tracking.get_difference_history       SchemeDetailPage / fetchTrackingDiffHistory
GET   /tracking/sync-logs                      NO  ?limit                                                       List[TrackingSyncLogOut]                 tracking.list_tracking_sync_logs      AdminPage
POST  /tracking/sync/error                     NO  ?as_of_date                                                  MessageResponse                          tracking.trigger_te_sync              TrackingPage / triggerTrackingSync
POST  /tracking/sync/difference                NO  ?report_month                                                MessageResponse                          tracking.trigger_td_sync              TrackingPage
```

## Disclosure
```
POST  /disclosure/monthly/upload              NO  multipart(file, Form(report_month))                MessageResponse        disclosure.upload_monthly_disclosure       DisclosurePage
GET   /disclosure/monthly/uploads             NO  ?page&page_size                                    {items[],total}        disclosure.list_monthly_uploads            DisclosurePage
GET   /disclosure/monthly/rows                NO  ?upload_id&amfi_code&amc_name&report_month&page&page_size  {items[],total} disclosure.list_monthly_rows           DisclosurePage
POST  /disclosure/sub-classification/upload   NO  multipart(file, Form(report_month))                MessageResponse        disclosure.upload_sub_classification       DisclosurePage
GET   /disclosure/sub-classification/rows     NO  ?upload_id&amfi_code&report_month&page&page_size   {items[],total}        disclosure.list_sub_classification_rows    DisclosurePage
POST  /disclosure/quarterly/upload            NO  multipart(file, Form(report_quarter))              MessageResponse        disclosure.upload_quarterly_disclosure     DisclosurePage
GET   /disclosure/quarterly/rows              NO  ?upload_id&amfi_code&report_quarter&page&page_size {items[],total}        disclosure.list_quarterly_rows             DisclosurePage
```

## Market Cap
```
POST  /market-cap/upload   NO  multipart(file, Form(effective_date?))   MessageResponse(422 on parse fail)       market_cap.upload_market_cap   MarketCapPage
GET   /market-cap/uploads  NO  ?page&page_size                          {items[],total}                          market_cap.list_uploads        MarketCapPage
GET   /market-cap/rows     NO  ?upload_id&isin&bucket&effective_date&search&page&page_size   {items[],total}     market_cap.list_rows           MarketCapPage
GET   /market-cap/latest   NO  ?bucket&search&page&page_size           {effective_date,total,items[]}            market_cap.latest_market_cap   MarketCapPage / SchemeDetailPage
```

## Portfolio
```
POST  /portfolio/upload                        NO  multipart(file, Form(report_month=YYYY-MM))    MessageResponse(422)   portfolio.upload_portfolio        PortfolioPage
GET   /portfolio/uploads                       NO  -                                              {items[]}              portfolio.list_uploads           PortfolioPage
GET   /portfolio/months                        NO  -                                              {months[]}             portfolio.list_months            PortfolioPage
GET   /portfolio/holdings                      NO  ?amfi_code&report_month&sector&search&security_class&page&page_size   {report_month,total,items[]} portfolio.list_holdings PortfolioPage
GET   /portfolio/top-holdings/{amfi_code}      NO  ?report_month&limit                            {report_month,top_holdings[],top_sectors[],avg_maturity_years,modified_duration} portfolio.top_holdings SchemeDetailPage
GET   /portfolio/sectors                       NO  ?report_month                                  {sectors[]}            portfolio.list_sectors            PortfolioPage
GET   /portfolio/overlap                       NO  ?amfi_code_1&amfi_code_2&report_month          {report_month,scheme_1,scheme_2,common_stocks,overlap_percentage,common_holdings[]} portfolio.portfolio_overlap PortfolioPage
GET   /portfolio/concentration/{amfi_code}     NO  ?report_month                                  {report_month,total_holdings,top5_weight,top10_weight,hhi,hhi_normalized,top10[]} portfolio.portfolio_concentration SchemeDetailPage
```

## Dividends
```
POST  /dividends/upload              NO  multipart(file)                                MessageResponse(422)   dividend.upload_dividends            (admin)
GET   /dividends/{amfi_code}         NO  ?dividend_type&from_date&to_date&page&page_size {amfi_code,total,items[]} dividend.get_dividends           SchemeDetailPage
GET   /dividends/{amfi_code}/summary NO  -                                              {total_dividends_declared,latest_record_date,latest_dividend_per_unit,cumulative_1y,cumulative_3y,cumulative_5y} dividend.dividend_summary SchemeDetailPage
```

## NPS / APY
```
POST /nps/upload                              NO  multipart(file=NAV_File_DDMMYYYY.zip)          UploadResult(400 on parse) nps.upload_nps_zip                   NPSPage
POST /nps/upload/bulk                         NO  multipart(files=List[zip])                     List[UploadResult]          nps.upload_nps_bulk                  NPSPage
GET  /nps/pfms                                NO  -                                              List[PfmOut]                nps.get_pfms                         NPSPage
GET  /nps/schemes                             NO  ?pfm_code&asset_class&tier&category&is_apy     List[SchemeOut]             nps.get_schemes                      NPSPage
GET  /nps/schemes/{scheme_code}               NO  -                                              SchemeOut(404)              nps.get_scheme_detail                NPSPage
GET  /nps/nav/{scheme_code}/history           NO  ?from_date&to_date (default last 1y)           List[NavPointOut](404)      nps.nps_nav_history                  NPSPage
GET  /nps/analytics/snapshots                 NO  ?pfm_code&asset_class&tier&category&is_apy&page&page_size  List[SnapshotOut] nps.nps_all_snapshots             NPSPage
GET  /nps/analytics/{scheme_code}             NO  -                                              SnapshotOut(404)            nps.nps_scheme_analytics             NPSPage
POST /nps/analytics/refresh                   NO  -                                              RefreshResult (sync, ~30-60s) nps.nps_refresh_all                NPSPage
POST /nps/analytics/refresh/{scheme_code}     NO  -                                              SnapshotOut(404)            nps.nps_refresh_one                  NPSPage
```

## Admin / Observability
```
GET  /admin/file-logs                          NO  ?module_name&status&limit                     List[FileLogOut]               admin.list_file_logs              AdminPage
GET  /admin/file-logs/{log_id}                 NO  -                                             FileLogOut(404)                admin.get_file_log                AdminPage
GET  /admin/rejected-rows                      NO  ?module_name&file_log_id&limit                List[{id,module_name,rejection_reason,created_at}] admin.list_rejected_rows AdminPage
GET  /admin/jobs                               NO  ?status&limit                                 List[BackgroundJobOut]         admin.list_jobs                   AdminPage
GET  /admin/reconciliation                     NO  ?status=OPEN&limit                            List[ReconciliationIssueOut]   admin.list_reconciliation_issues AdminPage
POST /admin/reconciliation/{issue_id}/resolve  NO  -                                             MessageResponse(404)           admin.resolve_reconciliation_issue AdminPage
```

---

# DATABASE_SCHEMA

> All tables: utf8mb4 / utf8mb4_unicode_ci. Created via SQLAlchemy `Base.metadata.create_all` at startup; further structural changes via Alembic in `backend/alembic/versions/`.
> Idempotent upserts in services depend on these unique-key combinations enforced by Alembic migrations:
>   daily_nav(amfi_code, nav_date), historical_nav(amfi_code, nav_date), nps_pfm(pfm_code), nps_scheme(scheme_code), nps_nav(scheme_code, nav_date).

## scheme module (`models/scheme.py`)

```
SchemeMaster (scheme_master)
  PK id BIGINT auto. amfi_code(idx), isin_div_payout_growth(idx), isin_div_reinvestment(idx),
  scheme_name, normalized_scheme_name(idx), amc_name(idx), fund_house, category_header,
  scheme_category(idx), scheme_type, scheme_sub_type, plan_type, option_type, is_active='Y',
  effective_from, raw_line(text), face_value, investment_objective(text), fund_manager_name,
  fund_manager_experience, alternate_benchmark, min_investment_amount, additional_investment_amount,
  sip_min_amount, dividend_frequency, maturity_type, exit_load, entry_load,
  created_at, updated_at(onupdate=now)
  Relations: 1→N (logical) NavPrice/DailyNAV/HistoricalNAV/AumScheme/MonthlyDisclosureRow/etc via amfi_code
  Used by: scheme_master_service, analytics_service.refresh_snapshot, every router via filter_by(amfi_code)

AmcMaster (amc_master)
  PK id. amc_name(unique), fund_house, amc_code, scheme_count, is_active='Y', created_at, updated_at
  Used by: scheme_master_service._rebuild_amc_master, analytics.summary

SchemeAliasMap (scheme_alias_map)
  PK id. amfi_code(idx), canonical_scheme_name, alias_scheme_name, isin, source_module,
  confidence_score, mapping_status='AUTO', created_at
  Used by: future fuzzy-match (rapidfuzz) for ingest reconciliation
```

## nav module (`models/nav.py`)

```
NavPrice (nav_price)             — declared as Base subclass BUT runtime is a VIEW unioning daily_nav+historical_nav (see services/nav_service.py comments)
  cols: id, amfi_code(idx), isin_div_payout_growth(idx), isin_div_reinvestment(idx), scheme_name,
        nav, repurchase_price, sale_price, nav_date(idx), source_type, source_priority=50, created_at
  Used by: nav.get_scheme_nav_history, analytics_service.compute_scheme_returns/52w/SIP/MaxDD/Sortino/VaR

DailyNAV (daily_nav)             — yesterday/today's snapshot, upserted daily
  + fund_house, raw_line                  upsert key: (amfi_code, nav_date)
  Source: AMFI portal.amfiindia.com/spages/NAVAll.txt

HistoricalNAVImportBatch (historical_nav_import_batch)
  batch_name, source_filename, source_file_type, uploaded_by, status='PROCESSED', total_rows,
  inserted_rows, updated_rows, notes, created_at

HistoricalNAV (historical_nav)
  + import_batch_id(idx), source_row_number          upsert key: (amfi_code, nav_date)
  Source: AMFI DownloadNAVHistoryReport_Po.aspx (date or range), uploaded TXT
```

## aum module (`models/aum.py`)

```
AverageAumScheme (average_aum_scheme)
  PK id. fy_id(idx), period_id(idx), fy_label, period_label, amfi_code(idx), isin, scheme_name,
  amc_name(idx), scheme_category(idx), average_aum_cr, fof_aum_cr, aum_equity_cr, aum_debt_cr,
  aum_hybrid_cr, aum_other_cr, folio_count, synced_at, created_at
  Composite logical key: (fy_id, period_id, amfi_code)
  Source: amfiindia.com/api/average-aum-schemewise?fyId&periodId

AverageAumFund (average_aum_fund)
  PK id. fy_id, period_id, …, amc_name(idx,nullable=False), total_aum_cr, fof_aum_cr,
  equity_aum_cr, debt_aum_cr, hybrid_aum_cr, other_aum_cr, folio_count, synced_at, created_at
  Composite logical key: (fy_id, period_id, amc_name)
  Source: amfiindia.com/api/average-aum-fundwise?fyId&periodId

AumSyncLog (aum_sync_log)
  data_type='SCHEME_WISE'|'FUND_WISE', fy_id, period_id, status='RUNNING|SUCCESS|FAILED',
  records_fetched, records_upserted, message(text), created_at
```

## disclosure module (`models/disclosure.py`)

```
SubClassificationUpload (sub_classification_upload)         report_month, source_filename, status, total_rows
SubClassificationRow    (sub_classification_row)            upload_id(idx), amfi_code(idx), isin, scheme_name, amc_name(idx),
                                                            scheme_category(idx), scheme_sub_category, sub_classification, report_month(idx), raw_json
MonthlyDisclosureUpload (monthly_disclosure_upload)         report_month, source_filename, status, total_rows
MonthlyDisclosureRow    (monthly_disclosure_row)            upload_id(idx), amfi_code(idx), isin, scheme_name, amc_name(idx), scheme_category,
                                                            report_month(idx), aum_cr, expense_ratio, portfolio_turnover, fund_manager,
                                                            benchmark_name, inception_date, exit_load(text), raw_json
QuarterlyDisclosureUpload (quarterly_disclosure_upload)     report_quarter, source_filename, status, total_rows
QuarterlyDisclosureRow    (quarterly_disclosure_row)        upload_id(idx), amfi_code(idx), isin, scheme_name, amc_name(idx), scheme_category,
                                                            report_quarter(idx), std_deviation, beta, sharpe_ratio, portfolio_turnover, raw_json
Used by: analytics_service.refresh_snapshot pulls latest MonthlyDisclosureRow.aum_cr/expense_ratio + QuarterlyDisclosureRow.{sharpe,beta,std}.
```

## market_cap module (`models/market_cap.py`)

```
MarketCapCategorizationUpload (market_cap_categorization_upload)  effective_date, source_filename, title, status, total_rows
MarketCapCategorizationRow    (market_cap_categorization_row)
   upload_id(idx), rank_number(idx), company_name, isin(idx), bse_symbol, bse_market_cap_cr,
   nse_symbol, nse_market_cap_cr, msei_symbol, msei_market_cap_cr,
   avg_market_cap_cr, market_cap_bucket(idx)='Large Cap'|'Mid Cap'|'Small Cap', effective_date(idx)
Source: AMFI Market Cap Categorization Excel; effective_date auto-parsed from title row.
```

## tracking module (`models/tracking.py`)

```
TrackingError      amfi_code(idx), isin, scheme_name, amc_name(idx), benchmark_name, tracking_error,
                   period_type ('1Y' etc), as_of_date(idx), synced_at
TrackingDifference amfi_code(idx), isin, scheme_name, amc_name(idx), benchmark_name, tracking_difference,
                   report_month(idx), synced_at
TrackingSyncLog    data_type='TRACKING_ERROR|TRACKING_DIFFERENCE', status, records_fetched, records_upserted, message, as_of_date
```

## analytics module (`models/analytics.py`)

```
SchemeAnalyticsSnapshot (scheme_analytics_snapshot)       (one row per scheme; refreshed via refresh_all_snapshots)
  amfi_code(unique,idx), scheme_name, amc_name(idx), scheme_category(idx), latest_nav, nav_date(idx),
  return_1w/1m/3m/6m/1y/3y/5y/10y, since_inception, inception_date, aum_cr, expense_ratio,
  tracking_error_1y, tracking_diff_latest, nav_52w_high, nav_52w_low,
  sip_return_1y/3y/5y, sharpe_ratio, beta, std_deviation,
  max_drawdown, sortino_ratio, calmar_ratio, var_95,
  category_rank, category_count, category_quartile (1=best..4=worst),
  snapshot_refreshed_at, created_at, updated_at(onupdate)
```

## portfolio module (`models/portfolio.py`)

```
PortfolioUpload   id, report_month(YYYY-MM, idx), source_filename, uploaded_by, status, total_rows, notes, created_at
PortfolioHolding  upload_id(idx), report_month(idx), amfi_code(idx), scheme_name, company_name, company_isin(idx),
                  sector(idx), quantity, market_value_cr, percentage_exposure,
                  security_class('EQUITY|DEBT|GOV_SEC|T-BILL|OTHERS'), rating, rating_agency,
                  avg_maturity_years, modified_duration
Note: process_portfolio_file DELETEs all PortfolioHolding rows for the same report_month before insert (idempotent re-upload).
```

## dividend module (`models/dividend.py`)

```
DividendHistory   amfi_code(idx), isin(idx), scheme_name, record_date(idx), ex_dividend_date,
                  reinvestment_date, dividend_per_unit, face_value, nav_on_record_date,
                  dividend_yield (= div/nav*100), dividend_type('IDCW|Bonus|Special'),
                  report_month(YYYY-MM, idx)
```

## nps module (`models/nps.py`)

```
NPSPfm                pfm_code(unique,idx)='PFM001..PFM014', pfm_name
NPSScheme             scheme_code(unique,idx)='SM001001…', pfm_code(idx), scheme_name,
                      asset_class('E|C|G|A|NA'), tier('I|II|NA'), variant('POP|DIRECT|GS|NA'),
                      category('NPS|APY|APY_FUND|CENTRAL_GOVT|STATE_GOVT|NPS_LITE|CORPORATE_CG|UPS|TAX_SAVER|COMPOSITE|VATSALYA|RETIREMENT_YOJANA'),
                      is_apy(0/1), is_active(0/1)
NPSNav                scheme_code(idx), nav_date(idx), nav  — UNIQUE(scheme_code, nav_date)
NPSAnalyticsSnapshot  scheme_code(unique,idx), pfm_code(idx), pfm_name, scheme_name, asset_class, tier, variant,
                      category(idx), is_apy, latest_nav, nav_date(idx), nav_52w_high, nav_52w_low,
                      return_1w/1m/3m/6m/1y/3y/5y/10y/return_max,
                      sharpe_ratio, sortino_ratio, max_drawdown, volatility_1y, calmar_ratio, var_95,
                      category_rank, category_count, category_quartile,
                      snapshot_refreshed_at, created_at, updated_at
```

## observability module (`models/observability.py`)

```
DataSourceFileLog       module_name(idx), source_type, source_url, source_filename, file_hash_sha256, file_size_bytes,
                        mime_type, status(idx)='RECEIVED', processing_started_at/completed_at,
                        row_count_total/inserted/updated/rejected, error_message, metadata_json
RejectedDataRow         file_log_id(idx), module_name, raw_json, rejection_reason, created_at
BackgroundJob           job_type(idx), status(idx)='PENDING', payload_json, result_json, error_message, started_at, completed_at
ReconciliationIssue     issue_type, entity_type, entity_key, severity, status(idx)='OPEN', details_json, created_at, resolved_at
```

## Alembic migrations

```
d1e2f3a4b5c6  analytics_scheme_metadata_portfolio   — adds analytics + portfolio metadata
e3f4a5b6c7d8  advanced_analytics_metrics            — adds sortino/calmar/var/max_drawdown columns
f4a5b6c7d8e9  dividend_history                      — creates dividend_history table
a3c9e1b72d44  update_market_cap_tables              — schema change for market cap
f74b3ac8b7a7  add_fof_aum_cr_to_aum_tables          — adds fof_aum_cr to AverageAumScheme/Fund
```

## Logical relationships

```
amfi_code is the universal scheme key (string) — joins SchemeMaster ↔ NavPrice ↔ DailyNAV ↔ HistoricalNAV ↔
  AverageAumScheme ↔ MonthlyDisclosureRow ↔ QuarterlyDisclosureRow ↔ SubClassificationRow ↔
  TrackingError ↔ TrackingDifference ↔ SchemeAnalyticsSnapshot ↔ PortfolioHolding ↔ DividendHistory.
amc_name string joins SchemeMaster ↔ AmcMaster ↔ AverageAumFund ↔ disclosure tables.
NPS uses scheme_code (different namespace) joining NPSPfm ↔ NPSScheme ↔ NPSNav ↔ NPSAnalyticsSnapshot.
NO foreign-key constraints declared in models — joins are by application convention.
```

---

# AUTH_SYSTEM

```
Status: NOT IMPLEMENTED.
There is NO login flow, NO signup flow, NO OTP, NO token issuance/refresh, NO session middleware,
NO RBAC, NO user model, NO password storage, NO JWT, NO cookies-as-auth.
SECRET_KEY exists in config.py but is unused (no JWT/session signing anywhere in code).
The only network boundary is CORSMiddleware (allow all methods/headers, allow_origins from CORS_ORIGINS env).
Implication: every endpoint listed in API_INDEX is publicly callable from any allowed origin.
```

---

# ENV_VARIABLES

## Backend (`backend/.env` → `app/config.py:Settings`)

```
DATABASE_URL  → SQLAlchemy MySQL connection string (default: mysql+pymysql://root:password@localhost:3306/mutualfund_analytics?charset=utf8mb4)
SECRET_KEY    → declared but UNUSED in code today
UPLOAD_DIR    → upload destination for user-supplied files (default ./uploads)
LOG_LEVEL     → python logging level (default INFO)
CORS_ORIGINS  → comma-separated origin allow-list (default http://localhost:5173,http://localhost:3000)
```

## docker-compose injects (override .env)

```
DATABASE_URL=mysql+pymysql://root:password@mysql:3306/mutualfund_analytics?charset=utf8mb4
UPLOAD_DIR=/app/uploads
LOG_LEVEL=INFO
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
MYSQL_ROOT_PASSWORD=password
MYSQL_DATABASE=mutualfund_analytics
```

## Frontend
```
NONE at build/runtime. API_BASE_URL hard-coded to '/api' (src/config/constants.ts).
Routing handled at infra layer (vite proxy in dev; nginx in prod).
```

---

# DEPENDENCY_ANALYSIS

## Backend (`requirements.txt`)
```
fastapi==0.115.5            → ASGI web framework
uvicorn[standard]==0.32.1   → ASGI server (run.py)
sqlalchemy==2.0.36          → ORM + Core (raw text() upserts)
PyMySQL==1.1.1              → MySQL driver (sync)
cryptography==43.0.3        → required by PyMySQL for SHA256 auth
alembic==1.14.0             → DB migrations
pydantic==2.10.4            → schema/validation
pydantic-settings==2.7.0    → env-driven Settings()
python-dotenv==1.0.1        → .env loader (via pydantic-settings)
httpx==0.28.1               → (declared, FastAPI test deps)
requests==2.32.3            → AMFI fetches (utils/http_client.py)
pandas==2.2.3               → Excel/CSV parsing
openpyxl==3.1.5             → .xlsx reader
xlrd==2.0.1                 → legacy .xls reader
apscheduler==3.10.4         → BackgroundScheduler cron jobs
python-multipart==0.0.17    → FastAPI UploadFile / Form
aiofiles==24.1.0            → async file IO
rapidfuzz==3.10.1           → scheme-name fuzzy matching (alias map)
numpy==2.2.1                → pandas dep
pytz==2024.2                → timezone handling
python-dateutil>=2.8        → relativedelta in nav bulk-fetch and SIP XIRR
```

## Frontend (`package.json`)
```
react@^18.2.0               → UI runtime
react-dom@^18.2.0
react-router-dom@^6.22.3    → SPA routing
@tanstack/react-query@^5.28.0 → server-state cache
axios@^1.6.8                → HTTP client
recharts@^2.12.4            → charts
lucide-react@^0.363.0       → icon set
date-fns@^3.6.0             → date formatting
tailwindcss@^3.4.3 (+ postcss, autoprefixer) → styling
vite@^5.2.0 + @vitejs/plugin-react           → build
typescript@^5.2.2           → types
eslint@^8.57.0 + @typescript-eslint + react-hooks/react-refresh plugins
```

---

# INTEGRATIONS

```
Service                         Usage                                              Files
-------                         -----                                              -----
AMFI scheme master              GET portal.amfiindia.com/DownloadSchemeData_Po.aspx?mf=0   services/scheme_master_service.py
AMFI Daily NAV (NAVAll.txt)     GET portal.amfiindia.com/spages/NAVAll.txt          services/nav_service.fetch_daily_nav
AMFI Historical NAV (per-date)  GET portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt={d}  services/nav_service.fetch_historical_nav_for_date
AMFI Historical NAV (range)     GET …?frmdt&todt                                    services/nav_service.fetch_historical_nav_range
AMFI AUM scheme-wise (JSON)     GET amfiindia.com/api/average-aum-schemewise?fyId&periodId&MF_ID=0   services/aum_service.py
AMFI AUM fund-wise (JSON)       GET amfiindia.com/api/average-aum-fundwise?fyId&periodId            services/aum_service.py
AMFI Tracking Error (JSON)      GET amfiindia.com/api/tracking-error-data?MF_ID=all&strdt={d}       services/tracking_service.py
AMFI Tracking Difference (JSON) GET amfiindia.com/api/tracking-difference?MF_ID=all&date={d}        services/tracking_service.py
NPS Trust ZIPs (manual upload)  NAV_File_DDMMYYYY.zip / parse_nps_zip               parsers/nps_parser.py + services/nps_service.py
APScheduler (in-process)        Asia/Kolkata, BackgroundScheduler                   jobs/scheduler.py

NOT INTEGRATED (no code refs found): Firebase, Meta Pixel, Razorpay/Stripe/Paytm, SMS/Email providers, Google Analytics, third-party webhooks.
```

HTTP shared session: `utils/http_client.HTTP_SESSION` — `requests.Session` with `Retry(total=3, backoff_factor=1, status_forcelist=[429,500,502,503,504])` and a browser User-Agent (AMFI blocks bare requests UA).

---

# SECURITY_NOTES

```
auth_protections    : NONE. All endpoints public.
validation_coverage : Pydantic schemas on responses; query/form/path validation via FastAPI annotations.
                      Strict pattern guards: rolling_returns regex on `period`, portfolio /upload report_month regex YYYY-MM.
token_risks         : N/A — no tokens.
secrets_exposure    : `backend/.env` and `docker-compose.yml` ship hardcoded mysql password=`password` and SECRET_KEY=`dev-secret-key`.
                      `setup.sh` likely seeds local creds. NOT production-safe.
cors                : allow_origins=env list (default http://localhost:5173,http://localhost:3000),
                      allow_credentials=True, allow_methods=["*"], allow_headers=["*"]. Wildcard methods+headers
                      with credentials=True is browser-relaxed but workable; tighten origins in prod.
unsafe_patterns     :
  - SQL injection: queries are SQLAlchemy ORM or named-param `text()` — NO string concatenation found.
  - Path traversal: file_utils.save_upload writes original filename into UPLOAD_DIR; review whether filename sanitization is present (file_utils not fully audited).
  - HTTPException(422) returned with raw exception messages (e.g. market-cap upload includes the parser error verbatim) — minor info-leak risk.
  - PATCH /scheme-master/{amfi_code} accepts arbitrary edits with no auth — anyone reachable can mutate metadata.
  - POST /admin/reconciliation/{id}/resolve has no auth.
  - Bulk-fetch endpoints (POST /nav/historical/bulk-fetch-all, POST /nav/historical/fetch-from-url, POST /aum/sync/bulk) trigger expensive AMFI scrapes from any anonymous caller (DoS amplifier).
missing_protections :
  - No rate limiting (no slowapi/middleware).
  - No request body size cap beyond FastAPI defaults.
  - No virus/zip-bomb scanning on uploaded ZIP/Excel/CSV.
  - No request-id / structured logging context.
  - No /metrics endpoint or auth on /health/db (which exposes MySQL version string).
```

---

# KNOWN_ISSUES

```
duplicated_logic        :
  - get_nav_on_or_before / _nav_on_or_before logic and CAGR/absolute-return helpers duplicated between
    services/analytics_service.py and services/nps_analytics_service.py (intentional fork per docstring,
    but drift is a risk).
  - Manual dict-shaped responses in routers/portfolio.py, market_cap.py, disclosure.py, dividend.py
    bypass Pydantic response_model — leads to inconsistent JSON shapes vs. the schemas/ folder.

tight_coupling          :
  - Routers reach directly into Models AND call services — no repository layer.
  - Layered imports (e.g., main.py imports routers which import services which import models)
    — circular-import-safe today but fragile.

scalability_risks       :
  - APScheduler runs in the FastAPI process — multiple uvicorn workers would multiply jobs.
  - refresh_all_snapshots iterates all active schemes single-threaded (~thousands of rows ×
    multiple compute_* calls each) — long lock on DB session and CPU bound.
  - Bulk AUM sync = up to 100×20 = 2000 outbound HTTP calls in one request, sequential.
  - get_db() yields one session per request; long-running endpoints (refresh, bulk-fetch) hold the
    session open and may exhaust pool (size=10/overflow=20).

large_components        :
  - frontend/src/pages/SchemeDetailPage.tsx: ~43KB single-file monolith.
  - frontend/src/pages/PortfolioPage.tsx: ~27KB.
  - frontend/src/pages/NPSPage.tsx: ~22KB.
  - backend/app/routers/analytics.py: 21KB, 558 lines — mixes listing, returns calculator, calendar/rolling, goal calculators (lumpsum/sip/retirement), direct-vs-regular comparison.

missing_validations     :
  - No size cap on multipart uploads.
  - PATCH /scheme-master/{amfi_code} accepts any fields in SchemePatch with no business rules.
  - Goal calculator endpoints accept extreme inputs (years up to ∞) — no upper bounds beyond gt=0.

empty_planned_areas     :
  - frontend/src/components/forms/ and components/tables/ are empty.
  - SchemeMaster fields face_value/investment_objective/fund_manager_* exist in model but no parser populates
    them today (only the PATCH endpoint can fill them).
  - HistoricalNAVImportBatch.uploaded_by, updated_rows are never set by service code.

performance_bottlenecks :
  - SchemeAnalyticsSnapshot listing was specifically simplified (per code comment) to avoid MySQL
    filesort/tmp-table exhaustion — sort uses (scheme_category, scheme_name) instead of category_rank.
  - rolling_returns endpoint loads all NAVs into Python and runs O(N^2) inner loop.
  - compute_sip_return rebuilds nav_map per call (no cache); refresh_all calls it 3× per scheme.
```

---

# AI_QUICK_CONTEXT

```
STACK
  FE: React18+TS+Vite+Tailwind+ReactRouter6+ReactQuery5+Axios+Recharts+lucide
  BE: Python3.13+FastAPI0.115+SQLAlchemy2+PyMySQL+Pydantic2+APScheduler+Pandas
  DB: MySQL8 utf8mb4 STRICT mode; tables auto-created via Base.metadata.create_all + alembic
  Infra: docker-compose (mysql + backend:8000 + nginx-frontend:3000); dev: vite:5173 proxies /api → :8000

DOMAIN
  AMFI mutual fund analytics. Universal key=amfi_code (string). 24 SQL tables across modules:
  scheme, nav, aum, disclosure, market_cap, tracking, analytics, portfolio, dividend, nps, observability.

ARCH
  3-tier monolith. 11 routers under /scheme-master, /nav, /aum, /analytics, /tracking, /disclosure,
  /market-cap, /portfolio, /dividends, /nps, /admin + /health, /health/db.
  Pattern: router → service → (parser if external) → SQLAlchemy session → MySQL.
  Hot-path upserts via raw text() INSERT ... ON DUPLICATE KEY UPDATE; idempotent re-runs.
  nav_price is a VIEW unioning daily_nav + historical_nav.
  Analytics computed offline into SchemeAnalyticsSnapshot / NPSAnalyticsSnapshot (one row per scheme)
  refreshed by scheduler at 01:00 IST + on-demand /analytics/refresh-snapshots (BackgroundTasks).

AUTH
  ABSENT. No login/JWT/RBAC/users. CORS only. SECRET_KEY declared but unused. All endpoints public.

API FLOW
  UI → src/api/<domain>.ts → src/api/client.ts(axios baseURL=/api) → vite/nginx proxy → FastAPI router →
  Depends(get_db) → SQLAlchemy Session → MySQL. Pydantic response_model on most GETs.

INGEST FLOW
  APScheduler tick OR POST /<x>/sync → services.fetch_*() → utils.http_client.HTTP_SESSION.get(AMFI_URL)
  → parsers.parse_*() → service._upsert_*() (raw INSERT … ON DUPLICATE KEY UPDATE) → MySQL.
  Logs to AumSyncLog/TrackingSyncLog/HistoricalNAVImportBatch/DataSourceFileLog.

UPLOAD FLOW
  POST /<x>/upload (multipart) → utils.file_utils.save_upload() → parsers.parse_*() → service.process_*()
  → DB upsert → MessageResponse. Idempotent for portfolio (deletes + reinserts per report_month).

SCHEDULER (Asia/Kolkata)
  scheme_master_sync   weekly Sun 02:00
  daily_nav_sync       daily 09:30
  tracking_sync        monthly 5th 06:00
  snapshot_refresh     daily 01:00

ANALYTICS
  refresh_snapshot computes returns 1W..10Y (CAGR for >1y, absolute else; rejects gap > expected window),
  52w hi/lo, monthly SIP XIRR via Newton-Raphson (no scipy), max_drawdown 3y, sortino 3y, var_95 1y,
  calmar = ann_3y / max_dd, then category_rank/quartile by 1Y return.

NPS PIPELINE
  ZIP upload → parsers/nps_parser.py auto-classifies (asset_class E/C/G/A, tier I/II, variant POP/DIRECT/GS,
  category APY/NPS/CENTRAL_GOVT/...) → upserts NPSPfm/NPSScheme/NPSNav.
  Analytics snapshot refresh runs synchronously per /nps/analytics/refresh.

KEY ROUTES & PAGE WIRING
  / → /analytics/summary + /nav/daily/latest-date + /analytics/top-performers
  /schemes/:amfiCode → 8 endpoints in parallel (snapshot, returns, rolling, calendar, top-holdings,
                       concentration, dividends/summary, tracking history, direct-vs-regular)
  /portfolio → /portfolio/{holdings,sectors,overlap,top-holdings,concentration}
  /goal-calculator → /analytics/goal/{lumpsum,sip,retirement}
  /category → /analytics/category/comparison

DEPLOY
  docker-compose up:
    mysql:3306 (init via mysql-init/01_init.sql, utf8mb4, max_allowed_packet=256M, buffer_pool=512M)
    backend:8000 (uvicorn run.py, Base.metadata.create_all on startup, scheduler started in lifespan)
    frontend:3000 (nginx serves built dist + proxies /api/ → backend:8000/)

DEV
  Backend: cd backend && python run.py  (or uvicorn app.main:app)
  Frontend: cd frontend && npm run dev   (vite :5173, proxies /api → :8000)
  DB: mysql via docker-compose, or local MySQL with DATABASE_URL override.

GOTCHAS
  - amfi_code is a STRING (not int) — many fields like "INF…" or "100xxx".
  - nav_price is queried like a table but is actually a VIEW; do not insert into it.
  - PATCH /scheme-master accepts arbitrary mutable metadata with no auth.
  - bulk-fetch endpoints can DoS AMFI from anonymous callers.
  - APScheduler runs in-process — running multiple uvicorn workers will duplicate cron jobs.
  - nav_price is declared as a SQLAlchemy model but persists as a VIEW — Base.metadata.create_all on a
    fresh DB might emit a CREATE TABLE that conflicts with later view-creation migrations; check Alembic order.
  - frontend/src/components/forms/ and tables/ are empty placeholder dirs.
  - SECRET_KEY in config.py is declared but unused — do not assume JWT/session is wired anywhere.
```

---

# MERMAID_DIAGRAMS

## System architecture
```mermaid
flowchart LR
  Browser["Browser SPA"] -->|HTTP /api/*| Nginx["nginx :3000"]
  Browser -. dev .-> Vite["vite :5173 proxy /api"]
  Nginx --> Backend["FastAPI :8000<br/>uvicorn"]
  Vite --> Backend
  Backend --> MySQL[("MySQL 8<br/>mutualfund_analytics<br/>utf8mb4")]
  Backend -->|requests.Session<br/>retries 3| AMFI["AMFI Portals<br/>portal.amfiindia.com<br/>www.amfiindia.com"]
  Backend -->|in-process| APS["APScheduler<br/>(Asia/Kolkata)"]
  APS -->|cron| Backend
  User["User uploads .xlsx/.csv/.zip"] --> Backend
  Backend -->|writes| Uploads[("./uploads volume")]
```

## Request lifecycle
```mermaid
sequenceDiagram
  participant C as Client
  participant FE as React SPA
  participant Px as nginx/vite
  participant API as FastAPI Router
  participant Svc as Service
  participant DB as MySQL
  C->>FE: navigate /schemes/:code
  FE->>Px: GET /api/scheme-master/{code}
  Px->>API: GET /scheme-master/{code}
  API->>API: Depends(get_db) → Session
  API->>DB: SELECT ... WHERE amfi_code=:c
  DB-->>API: row
  API-->>Px: SchemeMasterOut JSON
  Px-->>FE: JSON
  FE-->>C: render
```

## Ingest flow (AMFI sync)
```mermaid
sequenceDiagram
  participant Sched as APScheduler
  participant Svc as nav_service
  participant HTTP as HTTP_SESSION
  participant AMFI as portal.amfiindia.com
  participant Pars as parsers/nav_all_parser
  participant DB as MySQL
  Sched->>Svc: 09:30 IST → fetch_daily_nav(db)
  Svc->>HTTP: GET /spages/NAVAll.txt
  HTTP->>AMFI: HTTPS (browser UA, retry x3)
  AMFI-->>HTTP: text/plain (large)
  Svc->>Pars: parse_nav_all(text, nav_date)
  Pars-->>Svc: List[record]
  loop batch 200
    Svc->>DB: INSERT … ON DUPLICATE KEY UPDATE daily_nav
  end
  Svc-->>Sched: {nav_date,records,inserted}
```

## Analytics snapshot refresh
```mermaid
flowchart TB
  trig{{POST /analytics/refresh-snapshots OR cron 01:00}} --> bg[BackgroundTasks _run]
  bg --> all[refresh_all_snapshots]
  all --> loop[for each active SchemeMaster]
  loop --> rs[refresh_snapshot]
  rs --> nav[get_nav_on_or_before<br/>NavPrice VIEW]
  rs --> ret[compute_scheme_returns 1W..10Y]
  rs --> hi[compute_52w_high_low]
  rs --> sip[compute_sip_return Newton-Raphson]
  rs --> dd[compute_max_drawdown]
  rs --> so[compute_sortino_ratio]
  rs --> var[compute_var_95]
  rs --> ca[compute_calmar_ratio]
  rs --> mdy[(MonthlyDisclosureRow:<br/>aum_cr, expense_ratio)]
  rs --> qd[(QuarterlyDisclosureRow:<br/>sharpe, beta, std)]
  rs --> te[(TrackingError 1Y / TrackingDifference)]
  rs --> snap[(SchemeAnalyticsSnapshot UPSERT)]
  loop --> ranks[_compute_category_ranks]
  ranks --> snap
```

## DB relationships (logical, by amfi_code unless noted)
```mermaid
erDiagram
  SCHEME_MASTER ||--o{ DAILY_NAV : "amfi_code"
  SCHEME_MASTER ||--o{ HISTORICAL_NAV : "amfi_code"
  SCHEME_MASTER ||--o{ NAV_PRICE_view : "amfi_code (view)"
  SCHEME_MASTER ||--o{ AVERAGE_AUM_SCHEME : "amfi_code"
  SCHEME_MASTER ||--o{ MONTHLY_DISCLOSURE_ROW : "amfi_code"
  SCHEME_MASTER ||--o{ QUARTERLY_DISCLOSURE_ROW : "amfi_code"
  SCHEME_MASTER ||--o{ SUB_CLASSIFICATION_ROW : "amfi_code"
  SCHEME_MASTER ||--o{ TRACKING_ERROR : "amfi_code"
  SCHEME_MASTER ||--o{ TRACKING_DIFFERENCE : "amfi_code"
  SCHEME_MASTER ||--o{ PORTFOLIO_HOLDING : "amfi_code"
  SCHEME_MASTER ||--o{ DIVIDEND_HISTORY : "amfi_code"
  SCHEME_MASTER ||--|| SCHEME_ANALYTICS_SNAPSHOT : "amfi_code (1:1)"
  AMC_MASTER   ||--o{ SCHEME_MASTER : "amc_name"
  AMC_MASTER   ||--o{ AVERAGE_AUM_FUND : "amc_name"
  HISTORICAL_NAV_IMPORT_BATCH ||--o{ HISTORICAL_NAV : "import_batch_id"
  PORTFOLIO_UPLOAD ||--o{ PORTFOLIO_HOLDING : "upload_id"
  MONTHLY_DISCLOSURE_UPLOAD ||--o{ MONTHLY_DISCLOSURE_ROW : "upload_id"
  QUARTERLY_DISCLOSURE_UPLOAD ||--o{ QUARTERLY_DISCLOSURE_ROW : "upload_id"
  SUB_CLASSIFICATION_UPLOAD ||--o{ SUB_CLASSIFICATION_ROW : "upload_id"
  MARKET_CAP_CATEGORIZATION_UPLOAD ||--o{ MARKET_CAP_CATEGORIZATION_ROW : "upload_id"
  NPS_PFM ||--o{ NPS_SCHEME : "pfm_code"
  NPS_SCHEME ||--o{ NPS_NAV : "scheme_code"
  NPS_SCHEME ||--|| NPS_ANALYTICS_SNAPSHOT : "scheme_code (1:1)"
```

## Frontend ↔ Backend wiring
```mermaid
flowchart LR
  subgraph FE [React SPA src/]
    P1[DashboardPage]
    P2[SchemesPage]
    P3[SchemeDetailPage]
    P4[NAVPage]
    P5[AUMPage]
    P6[AnalyticsPage]
    P7[CategoryComparisonPage]
    P8[GoalCalculatorPage]
    P9[TrackingPage]
    P10[DisclosurePage]
    P11[PortfolioPage]
    P12[MarketCapPage]
    P13[NPSPage]
    P14[AdminPage]
    A[api/client.ts axios]
  end
  subgraph BE [FastAPI]
    R1[/analytics/]
    R2[/nav/]
    R3[/aum/]
    R4[/scheme-master/]
    R5[/tracking/]
    R6[/disclosure/]
    R7[/portfolio/]
    R8[/market-cap/]
    R9[/dividends/]
    R10[/nps/]
    R11[/admin/]
  end
  P1 --> A --> R1
  P2 --> A --> R4
  P3 --> A --> R1 & R2 & R5 & R7 & R9
  P4 --> A --> R2
  P5 --> A --> R3
  P6 --> A --> R1
  P7 --> A --> R1
  P8 --> A --> R1
  P9 --> A --> R5
  P10 --> A --> R6
  P11 --> A --> R7
  P12 --> A --> R8
  P13 --> A --> R10
  P14 --> A --> R11
```
