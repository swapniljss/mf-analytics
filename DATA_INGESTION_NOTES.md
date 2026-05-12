# MF Analytics — Data Ingestion Notes

Empirical observations from real deployment on AWS t3.micro (1 GB RAM + 2 GB swap).
What data populates which fields, how long each sync takes, and what depends on what.

---

## 📊 Master overview — fields populated by each sync

| Sync API | Time | Source | Tables populated | Row count (real) |
|---|---|---|---|---|
| `POST /scheme-master/sync` | ~30s | AMFI portal HTML | `scheme_master`, `amc_master` | 16,366 schemes / 53 AMCs |
| `POST /nav/sync` | ~10s | AMFI NAVAll.txt | `daily_nav` | ~14,360/day |
| `POST /aum/sync/scheme-wise` | ~5s/period | AMFI JSON API | `average_aum_scheme`, `aum_sync_log` | ~8,514/period |
| `POST /aum/sync/fund-wise` | ~5s/period | AMFI JSON API | `average_aum_fund`, `aum_sync_log` | ~52/period |
| `POST /aum/sync/bulk?data_type=BOTH` | **30–60 min** | AMFI JSON API (2000+ periods) | both AUM tables | ~850K rows total |
| `POST /tracking/sync/error` | ~10s | AMFI JSON API | `tracking_error`, `tracking_sync_log` | 0–5/period* |
| `POST /tracking/sync/difference` | ~10s | AMFI JSON API | `tracking_difference`, `tracking_sync_log` | 0/period* |
| `POST /nav/historical/bulk-fetch-all?from_year=2024` | **30–45 min bg** | AMFI history | `historical_nav`, `historical_nav_import_batch` | ~3M+ rows |
| `POST /nav/historical/bulk-fetch-all?from_year=2021` | **2–3 hrs bg** | AMFI history | same | ~10M+ rows |
| `POST /analytics/refresh-snapshots` | **10–15 min bg** | computed from DB | `scheme_analytics_snapshot` | 1 row per active scheme |
| File upload endpoints (`/portfolio/upload`, `/disclosure/*/upload`, etc.) | seconds | user file | respective tables | varies |

\* AMFI often doesn't return data for the current month — tracking syncs may complete with 0 records. Not a bug.

**bg** = background task. Endpoint returns 200 immediately; actual work continues server-side.

---

## 🔄 Dependency graph — what depends on what

```
[ Start: empty DB ]
         │
         ▼
┌────────────────────────────────┐
│ POST /scheme-master/sync       │   ← FOUNDATION. Run first.
│ Populates: scheme_master,      │
│            amc_master          │
└────────────┬───────────────────┘
             │
   ┌─────────┼─────────┬──────────────────┐
   ▼         ▼         ▼                  ▼
┌──────┐ ┌──────┐ ┌────────┐    ┌──────────────────┐
│ NAV  │ │ AUM  │ │Tracking│    │ Disclosure /     │
│ sync │ │ sync │ │ sync   │    │ Market Cap /     │
└──┬───┘ └──┬───┘ └────────┘    │ Portfolio uploads│
   │        │                    └──────────────────┘
   │        ▼                            (manual files)
   │   [average_aum_scheme,
   │    average_aum_fund]
   │
   ▼
[daily_nav]
   │
   ├──► (after /nav/historical/bulk-fetch-all)
   │     [historical_nav]
   │             │
   ▼             ▼
[Fix nav_price VIEW (one-time SQL)]
              │
              ▼
┌─────────────────────────────────┐
│ POST /analytics/refresh-snapshots│   ← LAST STEP. Run after data + view fix.
│ Populates:                       │
│   scheme_analytics_snapshot      │
│ Computes:                        │
│   returns_1w/1m/3m/6m/1y/3y/5y/10y│
│   sharpe, beta, sortino, calmar  │
│   max_drawdown, var_95           │
│   sip_return_1y/3y/5y            │
│   nav_52w_high/low               │
│   category_rank, quartile        │
└─────────────────────────────────┘
```

**Key rule:** Snapshot refresh quality = quality of underlying NAV data.
- No historical NAV → only short-term (`return_1w`, `return_1m`) computed; long-term returns NULL.
- With 2 years history → `return_1y` works.
- With 3+ years → `return_3y` works.
- With 5+ years → `return_5y`, `sip_return_5y`, sharpe, sortino all reliable.

---

## 🗓 Recommended seeding sequence with timings

### Minimum (5 min total) — works for demo
```
1. POST /scheme-master/sync                                            30s     [blocks]
2. POST /nav/sync                                                       10s     [blocks]
3. POST /aum/sync/scheme-wise?fy_id=1&period_id=1                        5s     [blocks]
4. POST /aum/sync/fund-wise?fy_id=1&period_id=1                          5s     [blocks]
5. POST /tracking/sync/error                                            10s     [blocks]
6. POST /tracking/sync/difference                                       10s     [blocks]
7. Fix nav_price VIEW (one SQL, see below)                               1s     [blocks]
8. POST /analytics/refresh-snapshots                                  ~10min    [background]
```

After this:
- Dashboard fully populated ✅
- Schemes/AMCs/AUM pages work ✅
- Latest NAV date populated ✅
- 1W/1M returns work
- 1Y+ returns: NULL (no history)

### Full (1.5–3 hrs total) — production-quality
```
1–8 (same as minimum)
9.  POST /nav/historical/bulk-fetch-all?from_year=2024                30–45min  [background]
10. wait for step 9 to finish (check historical_nav row count)
11. POST /analytics/refresh-snapshots (re-run)                        ~10min    [background]
```

After this:
- All return columns populated ✅
- Analytics page completely real ✅
- Top performers / category comparison meaningful ✅

### Heavy (3–6 hrs total) — only if you want 5Y data
```
9. POST /nav/historical/bulk-fetch-all?from_year=2021                2–3 hrs   [background]
```

On t3.micro this is very slow due to limited CPU + AMFI throttling. Run overnight.

---

## 🧮 Field-by-field — what populates when

### scheme_master (16,366 rows after sync)
Populated by: `POST /scheme-master/sync`

| Field | Always populated? | Notes |
|---|---|---|
| `amfi_code` | ✅ | Universal scheme key, string |
| `isin_div_payout_growth` | usually | Most schemes |
| `isin_div_reinvestment` | sometimes | Only for reinvestment plans |
| `scheme_name` | ✅ | Full name |
| `amc_name` | ✅ | |
| `fund_house` | ✅ | Usually = amc_name |
| `scheme_category` | ✅ | e.g. "Equity Scheme - Large Cap Fund" |
| `scheme_type` | ✅ | "Open Ended Schemes" / "Close Ended" |
| `plan_type` | ✅ | "Direct" / "Regular" |
| `option_type` | ✅ | "Growth" / "Dividend" / "IDCW" |
| `is_active` | ✅ | "Y" or "N" |
| `face_value`, `investment_objective`, `fund_manager_*`, `min_investment_*`, `sip_min_amount`, `exit_load`, `entry_load` | ❌ | **NEVER populated by sync.** Only fillable via `PATCH /scheme-master/{amfi_code}` |
| `created_at`, `updated_at` | ✅ | DB auto |

### amc_master (53 rows)
Auto-rebuilt during scheme master sync.

| Field | Populated by sync? |
|---|---|
| `amc_name` | ✅ |
| `scheme_count` | ✅ (counted from schemes) |
| `fund_house`, `amc_code` | ❌ NULL (not in AMFI data) |
| `is_active` | ✅ |

### daily_nav (~14,360/day)
Populated by: `POST /nav/sync` daily

| Field | Always? | Notes |
|---|---|---|
| `amfi_code` | ✅ | |
| `scheme_name` | ✅ | |
| `nav` | ✅ | Decimal up to 6 places |
| `nav_date` | ✅ | T-1 typically (AMFI publishes overnight) |
| `repurchase_price`, `sale_price` | sometimes | Many funds: NULL |
| `fund_house` | ✅ | |
| `isin_*` | usually | |
| `raw_line` | ✅ | Raw text from AMFI file |

⚠️ **Note:** `nav_price` is a VIEW that should mirror `daily_nav` + `historical_nav`. SQLAlchemy `create_all()` creates it as an empty TABLE. **Manual fix required** (see below).

### historical_nav (millions of rows after bulk fetch)
Populated by: `POST /nav/historical/bulk-fetch-all`

| Field | Populated? |
|---|---|
| Same as daily_nav | ✅ |
| `import_batch_id` | ✅ links to historical_nav_import_batch |
| `source_row_number` | ✅ |

### average_aum_scheme (8,514 per period × multiple periods)
Populated by: `POST /aum/sync/scheme-wise`

| Field | Always? | Notes |
|---|---|---|
| `fy_id`, `period_id` | ✅ | AMFI's identifiers |
| `fy_label`, `period_label` | ✅ | "January – March 2026" etc |
| `amfi_code` | ✅ | |
| `scheme_name`, `amc_name`, `scheme_category` | ✅ | |
| `average_aum_cr` | ✅ | Total AUM in crores |
| `aum_equity_cr`, `aum_debt_cr`, `aum_hybrid_cr`, `aum_other_cr` | sometimes | NULL for older periods |
| `fof_aum_cr` | sometimes | Fund of Funds — recent periods only |
| `folio_count` | ✅ | |

### average_aum_fund (52 per period)
Same fields as scheme but aggregated to AMC level.

### tracking_error / tracking_difference
Populated by: `POST /tracking/sync/error` and `/sync/difference`

**Empirically these often return 0 records** for current month — AMFI doesn't always publish for the latest month. Try older dates:
```
POST /tracking/sync/error?as_of_date=2024-12-01
```

| Field | Populated when AMFI has data |
|---|---|
| `amfi_code`, `scheme_name`, `amc_name` | ✅ |
| `benchmark_name` | ✅ |
| `tracking_error` (or `tracking_difference`) | ✅ |
| `period_type` | ✅ ("1Y", "3Y", "5Y") |
| `as_of_date` (or `report_month`) | ✅ |

### scheme_analytics_snapshot (one row per active scheme)
Populated by: `POST /analytics/refresh-snapshots`

This is the **most expensive** sync — iterates all 16K active schemes, computes ~20 metrics each.

| Field | Source | Fills when... |
|---|---|---|
| `latest_nav`, `nav_date` | NavPrice VIEW | nav_price has data (✅ after view fix) |
| `return_1w/1m/3m/6m` | computed from NavPrice lookups | always works if `daily_nav` has at least last 6 months |
| `return_1y` | CAGR over 365 days | needs 1+ year of history (`historical_nav` from 2024+) |
| `return_3y` | CAGR over 3 years | needs `historical_nav` from 2022+ |
| `return_5y` | CAGR over 5 years | needs `historical_nav` from 2020+ |
| `return_10y` | CAGR over 10 years | needs `historical_nav` from 2015+ |
| `nav_52w_high/low` | max/min over 365 days | needs ~1 year history |
| `sip_return_1y/3y/5y` | XIRR via Newton-Raphson | needs respective history |
| `sharpe_ratio`, `beta`, `std_deviation` | from `quarterly_disclosure_row` | needs **quarterly Excel uploaded** (Phase 6). Otherwise NULL. |
| `max_drawdown` | computed from 3y NAV history | needs ~3 years |
| `sortino_ratio` | computed from 3y daily returns | needs ~3 years + ~60 trading days |
| `var_95` | computed from 1y daily returns | needs ~1 year |
| `calmar_ratio` | `return_3y / max_drawdown` | derived |
| `aum_cr`, `expense_ratio` | from `monthly_disclosure_row` | needs **monthly Excel uploaded**. Otherwise NULL. |
| `tracking_error_1y`, `tracking_diff_latest` | from tracking tables | needs successful tracking sync |
| `category_rank`, `category_count`, `category_quartile` | computed across all snapshots | always works if at least `return_1y` populated |

**Observed real numbers on our deployment:**
| Sync state | schemes_with_returns |
|---|---|
| After only daily_nav (no history) | 0 |
| After historical_nav 2024+ | 8,000–10,000 |
| After historical_nav 2021+ | 14,000+ |

---

## ⚠️ The `nav_price` VIEW bug (and fix)

### Symptom
- `daily_nav` has rows ✅
- `nav_price` has 0 rows ❌
- `latest_nav_date: null` in summary
- All snapshots have NULL returns

### Cause
`nav_price` is supposed to be a database VIEW unioning `daily_nav` + `historical_nav`. But SQLAlchemy's `Base.metadata.create_all()` creates it as an empty regular TABLE. Alembic migrations (which we never ran) would normally convert it.

### Fix (run once after first deployment)
```bash
docker exec -i mf_mysql mysql -uroot -ppassword mutualfund_analytics <<'SQL'
DROP TABLE IF EXISTS nav_price;
CREATE VIEW nav_price AS
SELECT id, amfi_code, isin_div_payout_growth, isin_div_reinvestment, scheme_name, nav, repurchase_price, sale_price, nav_date, 'DAILY' AS source_type, 100 AS source_priority, created_at FROM daily_nav
UNION ALL
SELECT id + 10000000000, amfi_code, isin_div_payout_growth, isin_div_reinvestment, scheme_name, nav, repurchase_price, sale_price, nav_date, 'HISTORICAL' AS source_type, 50 AS source_priority, created_at FROM historical_nav;
SQL
```

**Verify:**
```bash
docker exec mf_mysql mysql -uroot -ppassword mutualfund_analytics -e "SELECT COUNT(*) FROM nav_price; SELECT MAX(nav_date) FROM nav_price;"
```

After fix, re-run `POST /analytics/refresh-snapshots`.

---

## 🚦 Things to expect on t3.micro

### Performance characteristics
- **CPU bursts:** t3.micro has a CPU credit system. Long runs can deplete credits → slows down.
- **RAM:** 1 GB total. MySQL alone uses 400 MB. Need swap (2 GB swapfile we added).
- **Disk I/O:** ~100 MB/s on gp3. Snapshot refresh hits this often.

### Real measured timings on AWS t3.micro
| Operation | Local (laptop, 16 GB RAM) | AWS t3.micro |
|---|---|---|
| Scheme master sync | ~30s | ~30s (network-bound) |
| Daily NAV sync | ~10s | ~10s |
| AUM single period | ~5s | ~5s |
| Snapshot refresh (16K schemes) | ~5 min | **10–15 min** |
| Historical NAV bulk (5 years) | ~20–30 min | **2–3 hrs** |
| Historical NAV bulk (2 years) | ~10 min | **30–45 min** |

### What can crash on t3.micro
- **OOM during snapshot refresh** — rare, but if backend container dies, restart with `docker compose restart backend` and re-run the refresh.
- **AMFI rate limits during bulk fetch** — AMFI sometimes throttles your IP. Retries built into `HTTP_SESSION`, but if a quarter fails entirely, just re-run; it skips already-fetched quarters.

---

## 📂 What stays empty until you upload files (Phase 6/7)

These tables ONLY populate when you upload AMFI source files. No sync API fetches them automatically.

| Table | Source file format | What it enables |
|---|---|---|
| `monthly_disclosure_row` | AMFI Monthly Disclosure Excel | `aum_cr`, `expense_ratio` in snapshots |
| `quarterly_disclosure_row` | AMFI Quarterly Disclosure Excel | `sharpe_ratio`, `beta`, `std_deviation` in snapshots |
| `sub_classification_row` | AMFI Sub-Classification Excel | Sub-category lookups |
| `market_cap_categorization_row` | AMFI Market Cap Excel | Market cap page |
| `portfolio_holding` | AMC monthly portfolio CSV/Excel | Portfolio page, overlap, HHI |
| `dividend_history` | Custom CSV | Dividend page |
| `nps_pfm`, `nps_scheme`, `nps_nav`, `nps_analytics_snapshot` | NPS Trust ZIP files | NPS/APY page |

**Without these uploads, the following UI pages will be empty:**
- Disclosure
- Portfolio
- Market Cap
- NPS / APY

(Dashboard, Schemes, AUM, Analytics, Goal Calculator, Category Compare all work without file uploads.)

---

## 🛑 Always-empty tables (codebase quirk)

These models exist but **no service writes to them.** Documented in `context.md`:

- `background_job` — no service populates this
- `reconciliation_issue` — no service populates this

`/admin/jobs` and `/admin/reconciliation` will always return `[]`. Not a bug, just unused models.

---

## 📅 Auto-scheduled syncs (already running on server)

APScheduler runs **inside the FastAPI process**. Already active on AWS, no setup needed:

| Job | When (Asia/Kolkata) | What it does |
|---|---|---|
| `scheme_master_sync` | Every 4th Sunday, 02:00 | Full schemes refresh |
| `daily_nav_sync` | Daily, 09:30 | Today's NAVs |
| `tracking_sync` | 5th of month, 06:00 | Tracking error + difference |
| `snapshot_refresh` | Daily, 01:00 | Recompute all analytics |

⚠️ **Caveat:** If you ever scale to multiple uvicorn workers, the cron jobs duplicate. Currently single worker → fine.

⚠️ **t3.micro note:** the 01:00 snapshot refresh takes 10–15 min and may briefly cause higher latency for users.

---

## 🎯 Quick reference — "I need to populate X, what do I run?"

| You want... | Run |
|---|---|
| Schemes list to fill | `POST /scheme-master/sync` |
| Latest NAV date / today's prices | `POST /nav/sync` |
| AUM tables / Dashboard AUM card | `POST /aum/sync/scheme-wise?fy_id=1&period_id=1` + same for fund-wise |
| Industry AUM trend chart | `POST /aum/sync/bulk?data_type=BOTH` (long) |
| Tracking error/difference pages | `POST /tracking/sync/error` + `/sync/difference` |
| 1Y/3Y/5Y returns on Analytics page | `POST /nav/historical/bulk-fetch-all?from_year=2021` + then `/analytics/refresh-snapshots` |
| Top performers, quartiles | `POST /analytics/refresh-snapshots` (after history is loaded) |
| Sharpe / Beta / Std Dev | Upload quarterly disclosure Excel (Phase 6) |
| AUM_cr / Expense Ratio in snapshots | Upload monthly disclosure Excel (Phase 6) |
| Market Cap page | Upload AMFI Market Cap Excel |
| Portfolio overlap / concentration | Upload portfolio CSV per scheme |
| Dividend history | Upload dividend CSV |
| NPS / APY pages | Upload NPS Trust ZIP files |
| Latest NAV Date card | **Fix nav_price VIEW** (SQL above) then `refresh-snapshots` |

---

## 📋 Health check — verify all data tiers

Run this on AWS (inside SSH, anytime):

```bash
docker exec mf_mysql mysql -uroot -ppassword mutualfund_analytics -e "
SELECT 'scheme_master' AS t, COUNT(*) AS n FROM scheme_master
UNION ALL SELECT 'daily_nav', COUNT(*) FROM daily_nav
UNION ALL SELECT 'historical_nav', COUNT(*) FROM historical_nav
UNION ALL SELECT 'nav_price (view)', COUNT(*) FROM nav_price
UNION ALL SELECT 'average_aum_scheme', COUNT(*) FROM average_aum_scheme
UNION ALL SELECT 'average_aum_fund', COUNT(*) FROM average_aum_fund
UNION ALL SELECT 'tracking_error', COUNT(*) FROM tracking_error
UNION ALL SELECT 'tracking_difference', COUNT(*) FROM tracking_difference
UNION ALL SELECT 'scheme_analytics_snapshot', COUNT(*) FROM scheme_analytics_snapshot;"

curl -s http://localhost:8000/analytics/summary
```

### Healthy state (target)
```
scheme_master:               16,366
daily_nav:                   14,360
historical_nav:              3,000,000+      (if you ran bulk-fetch)
nav_price (view):            (sum of above)
average_aum_scheme:          850,000+        (if you ran bulk AUM)
average_aum_fund:            3,000+
tracking_error:              5–100           (often low, AMFI dependent)
tracking_difference:         0–100           (often empty)
scheme_analytics_snapshot:   16,000+

summary: schemes_with_nav > 14000, schemes_with_returns > 8000, has_nav: true, has_returns: true
```

---

## 🔄 Snapshot refresh — what changes each run

Each call recomputes ALL fields. So if you:
- Add more historical NAV → re-run snapshot refresh → returns improve
- Upload disclosure Excel → re-run snapshot refresh → sharpe/beta populate
- Wait a week (more daily NAV accumulated) → re-run snapshot refresh → returns shift slightly

**Schedule already runs this daily at 01:00 IST.** Manual re-runs only needed after big data loads.

---

## 💡 Pro tips from real deployment

1. **Order matters.** Always: scheme master → NAV → AUM → tracking → snapshot. Snapshot last.

2. **Don't bulk-AUM unless needed.** It's 2000+ API calls to AMFI. Single period is enough for dashboard.

3. **2024+ history is the sweet spot** for t3.micro. Gives you working 1Y returns without 3-hour fetches.

4. **The nav_price VIEW fix is mandatory** on any fresh deployment. Without it, snapshots are useless even after refresh.

5. **AMFI is finicky.** Tracking data, sub-classification, even AUM for certain periods may return 0 records. Not your bug. Try older dates.

6. **Don't run `POST /aum/sync/bulk` on demo day.** It's a 30+ min blocking call. Use single periods.

7. **`schemes_with_returns: 0`** usually means snapshot refresh hasn't finished yet, OR nav_price is empty. Check both.

8. **Restart docker-compose after any model/migration change** — `Base.metadata.create_all()` only creates new tables; it doesn't alter existing ones.
