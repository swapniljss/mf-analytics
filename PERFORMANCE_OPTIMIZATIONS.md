# MF Analytics — Performance Optimization Guide

How to make data ingestion and frontend faster, ranked by **effort vs impact**.

---

## 🎯 Where time is actually spent today

```
Operation                              Current time        Where the bottleneck is
─────────────────────────────────────────────────────────────────────────────────
POST /scheme-master/sync               30 sec              AMFI server (network)
POST /nav/sync                         10 sec              AMFI server
POST /aum/sync/scheme-wise (1 period)  5 sec               AMFI server
POST /aum/sync/bulk                    30-60 min           AMFI rate limit + sequential
POST /nav/historical/bulk-fetch        30-45 min (2y)      AMFI rate limit + per-quarter
                                       2-3 hrs (5y)        same
POST /analytics/refresh-snapshots      10-15 min           CPU on t3.micro (SIP XIRR)
Frontend page load                     0.5 - 6 sec         rolling-returns is the only slow API

Schemes UI table render                300-500 ms          Network + paginated DB query
Scheme Detail page                     3-6 sec             rolling-returns endpoint = slow
```

**The two slowest things by far:** snapshot refresh (SIP XIRR Newton-Raphson math) and historical NAV fetch (AMFI rate limits).

---

## 🚀 Tier 1 — FREE quick wins (no code, no cost)

### 1. Don't run `aum/sync/bulk` — use single periods
**Saves: ~58 minutes**

Bulk syncs all 2000 fy/period combinations. You only need the latest 1–4 periods for dashboard.

```bash
# Instead of:
POST /aum/sync/bulk?data_type=BOTH                    # 30-60 min

# Run just the latest 4 quarters:
POST /aum/sync/scheme-wise?fy_id=1&period_id=1        # 5 sec each
POST /aum/sync/scheme-wise?fy_id=1&period_id=2        # ...
POST /aum/sync/scheme-wise?fy_id=1&period_id=3
POST /aum/sync/scheme-wise?fy_id=1&period_id=4
# Total: ~30 sec
```

### 2. Limit historical NAV to 2 years instead of 5
**Saves: 1.5–2 hours**

```bash
# Instead of:
POST /nav/historical/bulk-fetch-all?from_year=2021    # 2-3 hours

# Run:
POST /nav/historical/bulk-fetch-all?from_year=2024    # 30-45 min
```

You lose `return_5y` and `return_10y` but keep `return_1y`. For demo / most use cases, this is enough.

### 3. Schedule heavy syncs at night, not during demos
**Saves: zero downtime during demo**

APScheduler already runs them at 01:00 IST. Don't manually trigger during business hours.

```python
# Already configured in app/jobs/scheduler.py:
#   01:00  snapshot refresh
#   09:30  daily NAV sync
```

### 4. Use Postman environment caching
**Saves: 100-500 ms per request**

Postman caches DNS — set environment once, all subsequent requests are fast.

### 5. Run multiple syncs in parallel (different terminals)
**Saves: 50% on sequential blocks**

```bash
# Terminal 1
curl -X POST http://localhost:8000/scheme-master/sync &

# Terminal 2 (don't wait for #1)
curl -X POST http://localhost:8000/aum/sync/scheme-wise?fy_id=1&period_id=1 &

# These hit different AMFI endpoints — no conflict
```

⚠️ **Don't parallelize history fetch** — AMFI throttles aggressively.

### 6. Set Postman to skip empty-param queries
**Saves: avoids 422 errors, retries**

Uncheck unused query params in Postman so empty strings aren't sent.

---

## 🛠 Tier 2 — Code changes, MEDIUM effort (high impact)

### 7. Parallelize snapshot refresh
**Current: 10–15 min sequential.**
**After: 3–5 min with 4 workers.**

The current code in `app/services/analytics_service.py`:
```python
def refresh_all_snapshots(db: Session) -> dict:
    schemes = db.query(SchemeMaster.amfi_code).filter_by(is_active="Y").all()
    for (amfi_code,) in schemes:           # ← sequential, one at a time
        refresh_snapshot(db, amfi_code)
```

**Fix:** use `concurrent.futures.ThreadPoolExecutor` with separate DB sessions per worker:

```python
from concurrent.futures import ThreadPoolExecutor
from app.database import SessionLocal

def refresh_all_snapshots(db: Session) -> dict:
    schemes = db.query(SchemeMaster.amfi_code).filter_by(is_active="Y").all()
    codes = [s[0] for s in schemes]
    count = 0

    def _worker(amfi_code):
        worker_db = SessionLocal()
        try:
            refresh_snapshot(worker_db, amfi_code)
        finally:
            worker_db.close()

    with ThreadPoolExecutor(max_workers=4) as executor:
        for _ in executor.map(_worker, codes):
            count += 1

    _compute_category_ranks(db)
    return {"refreshed": count}
```

⚠️ Watch out for: DB pool limits (current `pool_size=10, max_overflow=20`). 4 workers is safe.

### 8. Cache `get_nav_on_or_before` lookups
**Current: ~16K × 11 queries = 176K DB hits per refresh.**
**After: ~1 query per scheme = 16K hits.**

Each scheme calls `get_nav_on_or_before` 11+ times (for each return period + 52w + SIP). Each is a separate `SELECT`. Replace with one bulk fetch:

```python
# In analytics_service.py
def refresh_snapshot(db, amfi_code):
    # Fetch ALL NAVs for this scheme ONCE
    nav_rows = db.query(NavPrice.nav_date, NavPrice.nav).filter(
        NavPrice.amfi_code == amfi_code
    ).order_by(NavPrice.nav_date).all()

    nav_dict = {d: float(n) for d, n in nav_rows}
    sorted_dates = sorted(nav_dict.keys())

    # Then look up in-memory instead of hitting DB
    def get_nav_before(target):
        # binary search on sorted_dates
        ...
```

**Saves: ~80% of snapshot refresh time** (DB query cost dominates over CPU math).

### 9. Skip SIP returns when data insufficient
**Saves: ~3 min per refresh.**

`compute_sip_return` runs 200 Newton-Raphson iterations even for schemes with too few NAVs. Add early exit:

```python
def compute_sip_return(db, amfi_code, years):
    # Quick check: do we have enough NAV history before doing expensive work?
    earliest = db.query(func.min(NavPrice.nav_date)).filter_by(amfi_code=amfi_code).scalar()
    if not earliest or (date.today() - earliest).days < years * 365:
        return None  # skip the math entirely
    # ... existing code
```

### 10. Index optimizations
**Saves: 30-50% on slow queries.**

Add composite indexes that match query patterns:

```sql
-- Speed up nav lookups during snapshot refresh
ALTER TABLE daily_nav      ADD INDEX idx_amficode_date_desc (amfi_code, nav_date DESC);
ALTER TABLE historical_nav ADD INDEX idx_amficode_date_desc (amfi_code, nav_date DESC);

-- Speed up snapshot listings with filters
ALTER TABLE scheme_analytics_snapshot ADD INDEX idx_category_return1y (scheme_category, return_1y);
ALTER TABLE scheme_analytics_snapshot ADD INDEX idx_amc_name (amc_name);
```

### 11. Convert `nav_price` from VIEW to MATERIALIZED-style table
**Saves: 50% on rolling-returns queries.**

A VIEW recomputes the UNION on every query. Replace with an actual table updated daily:

```sql
DROP VIEW IF EXISTS nav_price;
CREATE TABLE nav_price AS SELECT ... FROM daily_nav UNION ALL SELECT ... FROM historical_nav;
CREATE INDEX idx_nav_price_amficode_date ON nav_price(amfi_code, nav_date);

-- Add to scheduler: refresh once a day
-- TRUNCATE nav_price; INSERT INTO nav_price ...
```

⚠️ This is what the original code expected to happen via Alembic migration.

### 12. Pre-aggregate rolling returns
**Saves: 2-5 sec → 50 ms on Scheme Detail page.**

`/analytics/scheme/{code}/rolling-returns` is O(N²) — loops over all NAVs comparing each to each. For a 5-year history with 1250 trading days, that's 1.5M operations.

**Fix:** Compute rolling returns inside the snapshot refresh, store as JSON in a new column:

```python
# In refresh_snapshot()
rolling_series = compute_rolling_returns_series(db, amfi_code, period_years=1.0)
snapshot.rolling_returns_1y_json = json.dumps(rolling_series)
```

Then the API just returns the pre-computed JSON. **From 2-5 sec to < 100 ms.**

---

## 🏗 Tier 3 — Infrastructure upgrades (costs money, big wins)

### 13. Upgrade EC2 from t3.micro → t3.small
**Cost: ~₹1,500/month after free tier.**
**Improvement: 2x CPU, 2 GB RAM (vs 1 GB).**

| Metric | t3.micro | t3.small | Improvement |
|---|---|---|---|
| vCPU | 2 (burstable) | 2 (burstable) | same baseline, more burst credits |
| RAM | 1 GB | 2 GB | 2x — no swap needed |
| Snapshot refresh | 10–15 min | 5–8 min | ~50% faster |
| Historical NAV (2y) | 30–45 min | 20–30 min | ~33% faster |
| Concurrent users | 5 | 20 | 4x |
| Crash risk on heavy ops | High | Low | huge |

### 14. Use AWS RDS MySQL instead of containerized MySQL
**Cost: ~₹1,000/month (db.t3.micro) — Free tier eligible 12 months.**
**Improvement: tuned MySQL, automated backups, snapshots.**

t3.micro's MySQL fights backend for RAM. Moving MySQL to RDS frees up resources.

### 15. Add Redis (ElastiCache or container) for caching
**Cost: free if containerized, ~₹500/mo on AWS.**
**Improvement: 90% of read APIs return in < 50 ms.**

Cache:
- `/analytics/summary` (refresh every 5 min)
- `/analytics/snapshots` lists
- `/scheme-master` paginated results
- `/aum/periods` (rarely changes)

```python
# Add to backend
from redis import Redis
cache = Redis(host="redis")

@app.get("/analytics/summary")
def summary():
    cached = cache.get("summary")
    if cached:
        return json.loads(cached)
    data = compute_summary()
    cache.setex("summary", 300, json.dumps(data))  # 5 min
    return data
```

### 16. CloudFront CDN for frontend
**Cost: ~₹100/month for low traffic.**
**Improvement: 50-200ms faster page loads (especially for global users).**

Serve the React `dist/` bundle through CloudFront. Static assets cache at edge.

### 17. Run heavy syncs on AWS Batch / Spot instances
**Cost: free during burst, then negligible.**
**Improvement: Heavy syncs (5y history) on a separate beefy machine for 30 min, then shut down.**

Spin up a c5.xlarge spot instance, do the bulk-fetch in 10 min, shut down. ~₹10 for the whole run.

---

## 🧪 Tier 4 — Major architectural changes (big effort, big wins)

### 18. Use async background tasks (Celery + Redis)
**Effort: 2-3 days.**
**Improvement: True async, parallelism, retries, scheduled jobs all in one.**

Replace FastAPI BackgroundTasks (which run in same process and block scheduler) with proper task queue:

```python
# Producer
from celery import Celery
app = Celery("mf", broker="redis://redis:6379/0")

@app.task
def refresh_snapshot_task(amfi_code):
    ...

# In API
@app.post("/analytics/refresh-snapshots")
def trigger():
    for code in active_codes:
        refresh_snapshot_task.delay(code)
    return {"status": "queued"}
```

Workers can scale horizontally — run 4 worker containers, snapshot refresh drops to 4 min.

### 19. Streaming AMFI ingestion
**Effort: 1-2 days.**
**Improvement: Historical NAV in 10 min instead of 45 min.**

Currently `bulk-fetch-all` does sequential quarter-by-quarter. AMFI accepts year-long range queries — can request all 5 years in fewer larger calls and parse streaming.

### 20. Read replicas for analytics queries
**Cost: ~₹1,000/mo per replica.**
**Improvement: Read traffic doesn't compete with writes.**

When CEO + team use dashboard, queries hit replica. Snapshot refresh writes to primary.

### 21. Replace SIP XIRR Newton-Raphson with closed-form approximation
**Effort: 1 day.**
**Improvement: Removes the slowest 5 min of snapshot refresh.**

Newton-Raphson is exact but iterative. For SIP returns, a closed-form approximation is 95% accurate and 1000x faster:

```python
def fast_sip_xirr(monthly_amounts, final_value, months):
    # Approximation using Internal Rate of Return formula
    avg_invested = sum(monthly_amounts) / 2  # weighted middle
    total = final_value / sum(monthly_amounts)
    return ((total ** (12 / months)) - 1) * 100
```

### 22. Migrate from FastAPI BackgroundTasks to FastAPI + Celery
**Already covered in #18**

### 23. Move to ECS / Kubernetes
**Effort: 3-5 days.**
**Improvement: Auto-scaling, zero-downtime deploys.**

Containerized already → easy lift to ECS Fargate or EKS. Worth it if traffic grows.

---

## 🎯 What I'd do FIRST (priority order for your situation)

### Today (zero effort)
- ✅ **Already doing**: not running bulk AUM sync, using 2-year history

### This week (1 hour effort)
1. **#10 Add indexes** — paste these SQL commands once, immediate 30% speedup:

```bash
docker exec mf_mysql mysql -uroot -ppassword mutualfund_analytics <<'SQL'
ALTER TABLE daily_nav      ADD INDEX idx_amficode_date_desc (amfi_code, nav_date DESC);
ALTER TABLE historical_nav ADD INDEX idx_amficode_date_desc (amfi_code, nav_date DESC);
ALTER TABLE scheme_analytics_snapshot ADD INDEX idx_category_return1y (scheme_category, return_1y);
ALTER TABLE scheme_analytics_snapshot ADD INDEX idx_amc_name (amc_name);
SQL
```

2. **#11 Convert `nav_price` VIEW to TABLE** — easy SQL, 50% faster reads.

### Next sprint (1 day dev effort)
3. **#7 Parallelize snapshot refresh** — biggest single win (10 min → 4 min).
4. **#8 Bulk-fetch NAVs in `refresh_snapshot`** — 80% reduction in DB calls.
5. **#9 Skip SIP for schemes with no data** — saves 3 min wasted compute.

### When traffic justifies (₹1,500-3,000/mo)
6. **#13 Upgrade to t3.small** — single biggest infra improvement.
7. **#15 Add Redis caching** — frontend feels 10x faster.

### Skip for now (not worth the complexity)
- Celery (#18) — overkill for this scale
- Kubernetes (#23) — too much setup
- Read replicas (#20) — single-user demo doesn't need it

---

## 📊 Expected results after Tier 1+2 wins

| Operation | Before | After | Improvement |
|---|---|---|---|
| Snapshot refresh | 10–15 min | **3–5 min** | 3x faster |
| Historical NAV (2y) | 30–45 min | same | (network bound) |
| Rolling returns page | 2–5 sec | **< 100 ms** | 30x faster |
| `/analytics/summary` | 200 ms | **< 50 ms** (cached) | 4x faster |
| Concurrent users | 5 | **20** | 4x |

---

## 💡 The single best ROI

If you can only do ONE thing:

> **#7 — Parallelize the snapshot refresh.**
>
> 30 lines of code change, drops 10 min → 3 min. Affects every snapshot run forever. No infra cost.

If you can do TWO:

> Above + **#11 nav_price → real table with index**.
>
> Two SQL commands. Speeds up every NAV-related query in the system.

If you can do THREE:

> Above + **#13 upgrade to t3.small** (₹1500/mo after free tier).
>
> Removes RAM pressure permanently. No more OOM risks. Faster everything.

---

## 🛡 What NOT to do

- ❌ Don't try to parallelize AMFI calls — they'll IP-block you
- ❌ Don't increase ThreadPoolExecutor max_workers beyond 4 on t3.micro (RAM crash)
- ❌ Don't add Celery just because — it's overkill for < 1000 users
- ❌ Don't migrate to NoSQL — relational data + JOINs are exactly right here
- ❌ Don't skip historical NAV — without it, returns can't be computed

---

## ❓ Common bottleneck diagnostics

### "Snapshot refresh is taking forever"
Check CPU credits:
```bash
docker stats --no-stream
```
If CPU is steady at 5–10% on t3.micro, you're out of burst credits. Wait or upgrade.

### "Frontend is slow but API is fast"
Check if rolling-returns is being called on every page:
```bash
docker logs mf_backend --tail 100 | grep rolling
```
If yes → implement #12 (pre-aggregate in snapshot).

### "Random 500 errors during heavy load"
Likely OOM. Check:
```bash
docker logs mf_backend --tail 50 | grep -i "killed\|memory"
free -h
```
If memory exhausted → restart, then upgrade to t3.small.

### "AMFI sync returning empty"
Not a performance issue — AMFI didn't publish data for that period. Try a different date.
