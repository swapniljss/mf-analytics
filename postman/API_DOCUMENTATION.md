# Mutual Fund Analytics — API Documentation

> Companion to [postman/MutualFundAnalytics.postman_collection.json](MutualFundAnalytics.postman_collection.json) and [postman/MutualFundAnalytics.postman_environment.json](MutualFundAnalytics.postman_environment.json).
>
> **Source of truth:** [context.md](../context.md) (full architectural map) + cross-verified against `backend/app/routers/*.py`, `backend/app/services/*.py`, `backend/app/schemas/*.py`, and `frontend/src/api/*.ts`.

---

## 1. How to import

### Postman Desktop
1. **Import collection:** `File → Import` → select `MutualFundAnalytics.postman_collection.json`.
2. **Import environment:** same dialog → select `MutualFundAnalytics.postman_environment.json`.
3. **Activate environment:** top-right dropdown → "MF Analytics - Local".
4. Open any request → click **Send**. The default `baseUrl` is `http://localhost:8000` (direct backend).

### Postman CLI (newman)
```bash
newman run postman/MutualFundAnalytics.postman_collection.json \
  -e postman/MutualFundAnalytics.postman_environment.json
```

---

## 2. Authentication

**This project has NO authentication.** Verified across every router (`app/routers/*.py`) and the frontend axios client (`frontend/src/api/client.ts`):

- No `Depends(...)` on any token/user/session.
- `SECRET_KEY` is declared in `app/config.py` but **never imported anywhere**.
- No JWT, OAuth, cookies, refresh tokens, RBAC, or middleware beyond CORS.
- The frontend never attaches an Authorization header.

**Implication:** every endpoint is publicly callable. The Postman collection's root `auth` is set to `noauth`. Do not add tokens — the backend will silently ignore them.

> **Production-readiness flag:** several mutating endpoints (e.g. `PATCH /scheme-master/{amfi_code}`, `POST /admin/reconciliation/{id}/resolve`, all bulk-fetch/sync endpoints) accept anonymous calls. Treat the backend as internal-only behind a reverse proxy with auth, or add an auth layer before exposing it.

---

## 3. Environment variables (Postman)

Set in `MutualFundAnalytics.postman_environment.json`:

| Variable | Default | Used by |
|---|---|---|
| `baseUrl` | `http://localhost:8000` | Every request. Use `http://localhost:3000/api` (nginx) or `http://localhost:5173/api` (Vite dev) to hit through proxy — proxy strips `/api`. |
| `amfiCode` | `100027` | Scheme-Master, NAV, Analytics, Tracking, Portfolio, Dividends path/query |
| `npsSchemeCode` | `SM001001` | NPS path/query |
| `pfmCode` | `PFM001` | NPS schemes filter |
| `fyId` / `periodId` | `1` / `1` | AUM endpoints |
| `reportMonth` | `2025-06` | Portfolio (`YYYY-MM`) |
| `reportMonthDate` | `2025-06-01` | Disclosure / market-cap (`YYYY-MM-DD`) |
| `asOfDate` | `2025-04-01` | Tracking sync |
| `fromDate` / `toDate` | `2024-01-01` / `2024-12-31` | NAV/analytics ranges |
| `fileLogId` / `issueId` / `uploadId` | `1` | Admin / disclosure path params |

Edit in Postman → Environments → "MF Analytics - Local".

---

## 4. Common conventions

### Response shapes
Every paginated endpoint returns:
```json
{ "items": [], "total": 0, "page": 1, "page_size": 50, "total_pages": 0 }
```
*(Pydantic generic `PaginatedResponse[T]` from `app/schemas/common.py`.)*

Sync/upload endpoints return:
```json
{ "message": "<human-readable>", "detail": "<dict-as-string or null>" }
```

### Error shapes
FastAPI default — wraps everything in `{ "detail": ... }`. The `detail` is either a string (raised by `HTTPException`) or a list of validation errors (FastAPI's 422 format):

```json
{
  "detail": [
    {
      "loc": ["query", "page"],
      "msg": "ensure this value is greater than or equal to 1",
      "type": "value_error.number.not_ge"
    }
  ]
}
```

### Key types & enums
- `amfi_code` — **STRING** (e.g. `"100027"`, `"INF209KA12Z1"`). Never an int.
- `nps_scheme_code` — string matching `^SM\d{6}$` (e.g. `SM001001`).
- `pfm_code` — `PFM001` … `PFM014`.
- `period` (analytics) — regex `^return_(1w|1m|3m|6m|1y|3y|5y|10y)$`.
- `period_type` (tracking) — `"1Y"`, `"3Y"`, `"5Y"` (uppercase).
- `market_cap_bucket` — `"Large Cap"`, `"Mid Cap"`, `"Small Cap"` (with space).
- `security_class` — `EQUITY`, `DEBT`, `GOV_SEC`, `T-BILL`, `OTHERS`.
- `dividend_type` — `IDCW`, `Bonus`, `Special`.
- NPS `asset_class` — `E`, `C`, `G`, `A`, `NA`.
- NPS `tier` — `I`, `II`, `NA`.
- NPS `variant` — `POP`, `DIRECT`, `GS`, `NA`.
- NPS `category` — `NPS`, `APY`, `APY_FUND`, `CENTRAL_GOVT`, `STATE_GOVT`, `NPS_LITE`, `CORPORATE_CG`, `UPS`, `TAX_SAVER`, `COMPOSITE`, `VATSALYA`, `RETIREMENT_YOJANA`.
- AUM `data_type` — `BOTH | SCHEME_WISE | FUND_WISE`.

### Headers
- `Content-Type: application/json` for raw JSON bodies (PATCH).
- Multipart form-data is auto-set by Postman for file uploads — don't override.
- No required Authorization header.

### Background tasks
These return 200 immediately and run in the background — verify completion via the listed endpoints:

| Trigger | Track via |
|---|---|
| `POST /analytics/refresh-snapshots` | `GET /analytics/summary` (`schemes_with_returns` rises) |
| `POST /nav/historical/bulk-fetch-all` | `GET /nav/historical/batches` |
| `POST /nav/historical/fetch-from-url` | `GET /nav/historical/batches` |

### Scheduler (server-side, no API)
APScheduler runs in-process (`app/jobs/scheduler.py`, Asia/Kolkata):
- `scheme_master_sync` — every 4th week, Sun 02:00
- `daily_nav_sync` — every day 09:30
- `tracking_sync` — 5th of every month 06:00
- `snapshot_refresh` — every day 01:00

---

## 5. Endpoint matrix (~70 endpoints across 11 routers)

> Auth column omitted — none required for any endpoint.
> Pagination defaults: `page=1`, `page_size=50` (some 100/1000).

### Health
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness — `{status:"ok"}` |
| GET | `/health/db` | Returns MySQL version or DB error |

### Scheme Master
| Method | Path | Notes |
|---|---|---|
| GET | `/scheme-master` | Filters: `search`, `amc_name`, `category`, `plan_type`, `is_active`. Paginated. |
| GET | `/scheme-master/amcs` | Distinct AMC names |
| GET | `/scheme-master/categories` | Distinct categories |
| GET | `/scheme-master/{amfi_code}` | 404 if not found |
| PATCH | `/scheme-master/{amfi_code}` | Body = SchemePatch (all optional). **Anonymous mutate.** |
| POST | `/scheme-master/sync` | Pull AMFI scheme master (~30s) |
| GET | `/scheme-master/amc-master/list` | AMC master rows (paginated) |

### NAV
| Method | Path | Notes |
|---|---|---|
| GET | `/nav/daily` | Filters: `search`, `amfi_code`, `nav_date`. Paginated (≤1000). |
| GET | `/nav/daily/latest-date` | Single field response |
| POST | `/nav/sync` | Today's NAV pull |
| GET | `/nav/{amfi_code}/history` | **Required** `from_date` & `to_date`. Reads `nav_price` VIEW. |
| GET | `/nav/historical/batches` | List import batches |
| POST | `/nav/historical/fetch-date` | Form: `target_date` |
| POST | `/nav/historical/fetch-range` | Query: `from_date`, `to_date` (≤ 1y) |
| POST | `/nav/historical/bulk-fetch-all` | Background. Quarter-by-quarter from `from_year` |
| POST | `/nav/historical/fetch-from-url` | Background. URL + optional batch_name |
| POST | `/nav/historical/upload` | Multipart: `file` + `batch_name` |

### AUM
| Method | Path | Notes |
|---|---|---|
| GET | `/aum/scheme-wise` | fyId × periodId × filters |
| GET | `/aum/fund-wise` | AMC-level |
| GET | `/aum/periods` | Available (fy_id, period_id) tuples |
| GET | `/aum/sync-logs` | Recent sync runs |
| POST | `/aum/sync/scheme-wise` | One period |
| POST | `/aum/sync/fund-wise` | One period |
| POST | `/aum/sync/bulk` | All combinations (long) |

### Analytics
| Method | Path | Notes |
|---|---|---|
| GET | `/analytics/snapshots` | All scheme snapshots |
| GET | `/analytics/scheme/{amfi_code}/snapshot` | Returns `null` (not 404) if missing |
| GET | `/analytics/scheme/{amfi_code}/returns` | Returns + nav_history series |
| GET | `/analytics/scheme/{amfi_code}/rolling-returns` | `period_years` 0.5..10 |
| GET | `/analytics/scheme/{amfi_code}/calendar-returns` | Per-year |
| GET | `/analytics/top-performers` | `period` regex-validated |
| POST | `/analytics/refresh-snapshots` | Background |
| GET | `/analytics/summary` | Dashboard counters |
| GET | `/analytics/category/comparison` | Category peers + stats |
| GET | `/analytics/compare/direct-regular` | Plan pair comparison |
| GET | `/analytics/goal/lumpsum` | Pure calculator (no DB read) |
| GET | `/analytics/goal/sip` | Pure calculator |
| GET | `/analytics/goal/retirement` | Pure calculator |

### Tracking
| Method | Path | Notes |
|---|---|---|
| GET | `/tracking/error` | TE list + filters |
| GET | `/tracking/difference` | TD list + filters |
| GET | `/tracking/{amfi_code}/error-history` | Per-scheme TE |
| GET | `/tracking/{amfi_code}/difference-history` | Per-scheme TD |
| GET | `/tracking/sync-logs` | Recent runs |
| POST | `/tracking/sync/error` | Optional `as_of_date` |
| POST | `/tracking/sync/difference` | Optional `report_month` |

### Disclosure
| Method | Path | Notes |
|---|---|---|
| POST | `/disclosure/monthly/upload` | Multipart: `file`, Form `report_month` |
| GET | `/disclosure/monthly/uploads` | Upload list |
| GET | `/disclosure/monthly/rows` | Row-level filter |
| POST | `/disclosure/sub-classification/upload` | |
| GET | `/disclosure/sub-classification/rows` | |
| POST | `/disclosure/quarterly/upload` | Form `report_quarter` |
| GET | `/disclosure/quarterly/rows` | |

### Market Cap
| Method | Path | Notes |
|---|---|---|
| POST | `/market-cap/upload` | Optional Form `effective_date` (auto-parsed otherwise) |
| GET | `/market-cap/uploads` | |
| GET | `/market-cap/rows` | Filter by upload_id, isin, bucket, date, search |
| GET | `/market-cap/latest` | Most recent effective_date snapshot |

### Portfolio
| Method | Path | Notes |
|---|---|---|
| POST | `/portfolio/upload` | Form `report_month` (regex YYYY-MM). **Idempotent re-upload (deletes month first).** |
| GET | `/portfolio/uploads` | Last 100 |
| GET | `/portfolio/months` | Distinct YYYY-MM list |
| GET | `/portfolio/holdings` | Filters: amfi_code, sector, search, security_class. Defaults to latest month. |
| GET | `/portfolio/top-holdings/{amfi_code}` | + sector breakdown + maturity/duration |
| GET | `/portfolio/sectors` | Distinct sectors |
| GET | `/portfolio/overlap` | Two-scheme weight intersection |
| GET | `/portfolio/concentration/{amfi_code}` | HHI + top-5/10 weights |

### Dividends
| Method | Path | Notes |
|---|---|---|
| POST | `/dividends/upload` | Multipart `file` |
| GET | `/dividends/{amfi_code}` | Per-scheme list with type & date filters |
| GET | `/dividends/{amfi_code}/summary` | Cumulative 1Y/3Y/5Y |

### NPS / APY
| Method | Path | Notes |
|---|---|---|
| POST | `/nps/upload` | Single ZIP |
| POST | `/nps/upload/bulk` | Multiple ZIPs (one error per file allowed) |
| GET | `/nps/pfms` | All PFMs |
| GET | `/nps/schemes` | Filters: pfm_code, asset_class, tier, category, is_apy |
| GET | `/nps/schemes/{scheme_code}` | 404 |
| GET | `/nps/nav/{scheme_code}/history` | Default last 1Y. 404 |
| GET | `/nps/analytics/snapshots` | Filters: pfm_code, asset_class, tier, category, is_apy. Paginated (≤2000). |
| GET | `/nps/analytics/{scheme_code}` | 404 |
| POST | `/nps/analytics/refresh` | Synchronous (~30-60s for 252 schemes) |
| POST | `/nps/analytics/refresh/{scheme_code}` | 404 |

### Admin / Observability
| Method | Path | Notes |
|---|---|---|
| GET | `/admin/file-logs` | DataSourceFileLog list |
| GET | `/admin/file-logs/{log_id}` | One log, 404 |
| GET | `/admin/rejected-rows` | RejectedDataRow list |
| GET | `/admin/jobs` | BackgroundJob list |
| GET | `/admin/reconciliation` | Default `status=OPEN` |
| POST | `/admin/reconciliation/{issue_id}/resolve` | 404 |

---

## 6. Suggested run order (first-time seeding)

After `docker-compose up -d`:

```
1. POST /scheme-master/sync                              # ~30s, blocks
2. POST /nav/sync                                        # ~10s, blocks
3. POST /nav/historical/bulk-fetch-all?from_year=2021    # background, several minutes
   → poll GET /nav/historical/batches until quarters processed
4. POST /analytics/refresh-snapshots                     # background
   → poll GET /analytics/summary, watch schemes_with_returns rise
```

For NPS (only if you have NAV ZIP files):
```
5. POST /nps/upload  (multiple ZIPs via /upload/bulk)
6. POST /nps/analytics/refresh                          # synchronous ~30-60s
```

---

## 7. Frontend ↔ API mapping (cross-verified)

Every API call in `frontend/src/api/*.ts` maps to a request in this collection. Direct page-level usages (e.g. `SchemeDetailPage.tsx`) without going through the api/ wrapper are also covered. Key mappings:

| Frontend page/file | Endpoints called |
|---|---|
| `pages/DashboardPage.tsx` | `/analytics/summary`, `/nav/daily/latest-date`, `/analytics/top-performers` |
| `pages/SchemesPage.tsx` | `/scheme-master`, `/scheme-master/amcs`, `/scheme-master/categories` |
| `pages/SchemeDetailPage.tsx` | `/scheme-master/{code}`, `/analytics/scheme/{code}/snapshot`, `/analytics/scheme/{code}/returns`, `/analytics/scheme/{code}/rolling-returns`, `/analytics/scheme/{code}/calendar-returns`, `/analytics/compare/direct-regular`, `/portfolio/top-holdings/{code}`, `/portfolio/concentration/{code}`, `/dividends/{code}` + `/summary`, `/tracking/{code}/error-history` + `/difference-history`, `/market-cap/latest` |
| `pages/NAVPage.tsx` | `/nav/daily`, `/nav/sync`, `/nav/historical/batches`, `/nav/historical/fetch-*`, `/nav/historical/upload` |
| `pages/AUMPage.tsx` | `/aum/scheme-wise`, `/aum/fund-wise`, `/aum/periods`, `/aum/sync/*` |
| `pages/AnalyticsPage.tsx` | `/analytics/snapshots`, `/analytics/top-performers` |
| `pages/CategoryComparisonPage.tsx` | `/analytics/category/comparison`, `/scheme-master/categories` |
| `pages/GoalCalculatorPage.tsx` | `/analytics/goal/lumpsum`, `/analytics/goal/sip`, `/analytics/goal/retirement` |
| `pages/TrackingPage.tsx` | `/tracking/error`, `/tracking/difference`, `/tracking/sync/*`, `/tracking/sync-logs` |
| `pages/DisclosurePage.tsx` | `/disclosure/{monthly,sub-classification,quarterly}/{upload,uploads,rows}` |
| `pages/PortfolioPage.tsx` | `/portfolio/{upload,uploads,months,holdings,sectors,overlap}` |
| `pages/MarketCapPage.tsx` | `/market-cap/{upload,uploads,rows,latest}` |
| `pages/NPSPage.tsx` | All `/nps/*` |
| `pages/AdminPage.tsx` | `/admin/*`, `/aum/sync-logs`, `/scheme-master/sync`, `/analytics/refresh-snapshots`, `/scheme-master/amc-master/list` |

---

## 8. Discrepancies & inconsistencies discovered during cross-validation

Documented for transparency — the Postman collection still works as-is; these are server-side observations:

1. **Inconsistent response models.** Some routers return Pydantic `response_model=...` (full type validation), others build raw `dict`s manually. Examples of dict builders that bypass schemas:
   - `routers/portfolio.py` — every list endpoint uses `_row()` helper to build dicts.
   - `routers/market_cap.py`, `routers/disclosure.py`, `routers/dividend.py` — same pattern.
   - This means OpenAPI/`/docs` shows incomplete schemas for these endpoints. The Postman examples reflect the actual JSON shape.

2. **`SchemeReturnsOut` swallows exceptions.** `frontend/src/api/analytics.ts` wraps `fetchSchemeReturns` in try/catch returning a stub on error — useful, but masks the underlying API failure.

3. **`/analytics/scheme/{amfi_code}/snapshot` returns 200 with `null`** rather than 404. Frontend depends on this (per source comment). Postman example reflects this.

4. **`PATCH /scheme-master/{amfi_code}` is fully unauthenticated.** Mentioned as a "Known issue" in `context.md`. Consider this surface area before exposing the backend.

5. **Bulk endpoints can DoS upstream.** `POST /aum/sync/bulk`, `POST /nav/historical/bulk-fetch-all`, `POST /nav/historical/fetch-from-url` make many anonymous AMFI scrape calls. No rate limit on the API itself.

6. **`SECRET_KEY` is dead code.** Not loaded anywhere; never used to sign anything. Don't be misled into thinking auth exists.

7. **AMFI parsing is best-effort.** Some endpoints return 200 with `records: 0` when AMFI returns empty/changed format — check sync-log endpoints to verify.

8. **`MutualFundAnalytics.postman_collection.json` (existing root file)** in the project — this generated collection is in `postman/` and is a fresh, more complete rewrite. The root file may or may not be in sync; treat the `postman/` versions as canonical.

---

## 9. Files generated

- `postman/MutualFundAnalytics.postman_collection.json` — collection (~70 endpoints, examples + per-request descriptions)
- `postman/MutualFundAnalytics.postman_environment.json` — environment with 14 variables
- `postman/API_DOCUMENTATION.md` — this file

All three are import-ready. The collection sets `auth: noauth` at root, has a `prerequest` hook that warns if `baseUrl` is unset, and a global `test` hook asserting status < 400 and response time < 30s. Override either at the request level if needed.
