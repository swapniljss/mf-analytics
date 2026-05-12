# Hybrid Lakehouse — Step-by-Step Implementation Plan

How to migrate from "single MySQL" to "S3 + OpenSearch + Athena + MySQL" as the CEO's doc recommended.

**Realistic timeline:** 6–8 weeks for one developer working full-time.
**Realistic cost:** ₹0 (Phase 1 only, Free Tier) → ₹8,000–15,000/month (full setup).

---

## 🎯 Before you start — pre-requisites

| Item | Where to get it |
|---|---|
| AWS account with billing enabled | You already have one ✅ |
| AWS CLI installed on laptop | https://aws.amazon.com/cli/ — 5 min |
| IAM user with programmatic access | AWS Console → IAM → Users → create |
| Python with `boto3`, `pyarrow`, `pandas` | `pip install boto3 pyarrow pandas` |
| Backup of current MySQL | `mysqldump` first — DO THIS BEFORE STARTING |

**Backup command (do this first, always):**
```bash
docker exec mf_mysql mysqldump -uroot -ppassword mutualfund_analytics > backup_$(date +%Y%m%d).sql
```

---

## 📋 Overall plan — 4 phases

| Phase | What you build | Free tier OK? | Weeks |
|---|---|---|---|
| **1** | S3 + Athena for cold historical NAV | ✅ Mostly free | 1–2 |
| **2** | OpenSearch for hot analytics | ❌ ~₹6,000/mo | 2–3 |
| **3** | Refactor backend to use the 4 stores | — | 2 |
| **4** | Hardening (monitoring, backups, ILM) | — | 1 |

**Recommendation:** Do **Phase 1 only** first. It's free and validates 80% of the architecture. Decide Phase 2 after seeing results.

---

# 🌊 PHASE 1 — S3 + Athena (1-2 weeks, free tier)

**Goal:** Move historical NAV data out of MySQL and into S3 as Parquet files. Query them via Athena (SQL on S3 directly).

**After this phase:**
- MySQL still holds everything (don't delete anything yet)
- BUT historical NAV is also in S3 for cheap querying
- You can run SQL queries on years of NAV with no MySQL load

---

## Step 1.1 — Create S3 buckets

In AWS Console → S3 → "Create bucket":

| Setting | Value |
|---|---|
| Bucket name | `mf-analytics-data-{your-name}-2026` (must be globally unique) |
| Region | `ap-south-1` (Mumbai — same as EC2) |
| Block all public access | ✅ ON (default) |
| Bucket versioning | ✅ Enable |
| Default encryption | ✅ SSE-S3 |

Click Create. Repeat for one more bucket: `mf-analytics-athena-results-{your-name}-2026`.

**Folder structure to create (later, via uploads):**
```
mf-analytics-data-yourname-2026/
├── raw/
│   ├── nav/yyyy=2026/mm=05/dd=10/navall.txt
│   └── ...
└── curated/
    ├── nav/yyyy=2024/mm=01/part-0001.parquet
    ├── nav/yyyy=2024/mm=02/part-0001.parquet
    └── scheme_master/part-0001.parquet
```

---

## Step 1.2 — IAM user with S3 + Athena permissions

AWS Console → IAM → Users → "Add users":
- Name: `mf-analytics-app`
- Access type: ✅ Programmatic access
- Permissions: attach policies
  - `AmazonS3FullAccess` (or scope down to just your buckets)
  - `AmazonAthenaFullAccess`
  - `AWSGlueConsoleFullAccess`

After creating, copy:
- `Access Key ID`
- `Secret Access Key`

⚠️ Store these securely — you can't see the secret again.

Add to your backend `.env` file:
```env
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-south-1
S3_BUCKET_DATA=mf-analytics-data-yourname-2026
S3_BUCKET_ATHENA=mf-analytics-athena-results-yourname-2026
```

---

## Step 1.3 — Export historical NAV from MySQL to Parquet

Create a new file `backend/app/exporters/nav_to_parquet.py`:

```python
"""Export historical_nav from MySQL to S3 Parquet, partitioned by year/month."""
import os
from datetime import date
import boto3
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.nav import HistoricalNAV

S3 = boto3.client("s3", region_name=os.getenv("AWS_REGION"))
BUCKET = os.getenv("S3_BUCKET_DATA")

def export_month(year: int, month: int):
    """Export one month of historical NAV to S3 Parquet."""
    db = SessionLocal()
    try:
        start = date(year, month, 1)
        end = date(year + (month // 12), (month % 12) + 1, 1)

        df = pd.read_sql(
            db.query(HistoricalNAV)
              .filter(HistoricalNAV.nav_date >= start)
              .filter(HistoricalNAV.nav_date < end)
              .statement,
            db.bind
        )
        if df.empty:
            print(f"No rows for {year}-{month:02d}")
            return

        # Convert to Parquet in-memory
        table = pa.Table.from_pandas(df)
        local_path = f"/tmp/nav_{year}_{month:02d}.parquet"
        pq.write_table(table, local_path, compression="snappy")

        # Upload to S3 (partitioned path)
        key = f"curated/nav/yyyy={year}/mm={month:02d}/part-0001.parquet"
        S3.upload_file(local_path, BUCKET, key)
        print(f"Uploaded {len(df)} rows → s3://{BUCKET}/{key}")
        os.remove(local_path)
    finally:
        db.close()


def export_all_history():
    """Export every month with data, from 2021 to today."""
    for year in range(2021, 2027):
        for month in range(1, 13):
            export_month(year, month)
```

Run it once to seed S3:
```bash
docker exec mf_backend python -m app.exporters.nav_to_parquet
```

After this, all your historical NAV is also in S3 as Parquet files.

---

## Step 1.4 — Register tables in AWS Glue Catalog

AWS Console → Glue → Databases → "Add database":
- Name: `mf_analytics_lake`

Then → Crawlers → "Create crawler":
- Name: `nav-crawler`
- Data source: S3 path → `s3://mf-analytics-data-yourname-2026/curated/nav/`
- IAM role: AWSGlueServiceRole (create if needed)
- Output database: `mf_analytics_lake`
- Schedule: On demand (or daily)

Run the crawler. After ~1 min it creates a table `nav` in the catalog.

---

## Step 1.5 — Query with Athena

AWS Console → Athena → Query editor:

Set query result location:
- Settings → Query result location → `s3://mf-analytics-athena-results-yourname-2026/`

Run your first query:
```sql
SELECT scheme_name, COUNT(*) AS days_of_history, MIN(nav_date), MAX(nav_date)
FROM mf_analytics_lake.nav
WHERE yyyy = '2024'
GROUP BY scheme_name
ORDER BY days_of_history DESC
LIMIT 20;
```

Results come back in 2–10 seconds. **You're now querying historical NAV from S3 instead of MySQL.**

---

## Step 1.6 — Wire Athena into the backend (optional)

Add a new "cold query" endpoint that uses Athena instead of MySQL:

```python
# backend/app/services/athena_service.py
import boto3, time, os

ATHENA = boto3.client("athena", region_name=os.getenv("AWS_REGION"))
RESULT_BUCKET = f"s3://{os.getenv('S3_BUCKET_ATHENA')}/"

def run_query(sql: str) -> list[dict]:
    qid = ATHENA.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": "mf_analytics_lake"},
        ResultConfiguration={"OutputLocation": RESULT_BUCKET},
    )["QueryExecutionId"]

    # Poll for completion (typically 1-10 sec)
    while True:
        state = ATHENA.get_query_execution(QueryExecutionId=qid)["QueryExecution"]["Status"]["State"]
        if state in ("SUCCEEDED", "FAILED", "CANCELLED"):
            break
        time.sleep(0.5)

    if state != "SUCCEEDED":
        raise Exception(f"Athena query {state}")

    # Get results
    rows = ATHENA.get_query_results(QueryExecutionId=qid)["ResultSet"]["Rows"]
    headers = [c["VarCharValue"] for c in rows[0]["Data"]]
    return [
        {headers[i]: c.get("VarCharValue") for i, c in enumerate(r["Data"])}
        for r in rows[1:]
    ]
```

Use it for download-full-history kind of features:
```python
@router.get("/nav/full-history/{amfi_code}")
def full_history(amfi_code: str):
    sql = f"""
        SELECT nav_date, nav FROM mf_analytics_lake.nav
        WHERE amfi_code = '{amfi_code}'
        ORDER BY nav_date
    """
    return run_query(sql)
```

⚠️ **Bind SQL parameters properly** — never f-string user input. Use parameterized queries.

---

## Phase 1 cost (Free Tier)

| Service | Free tier | What you'll use | Cost |
|---|---|---|---|
| S3 storage | 5 GB free | ~500 MB Parquet | **₹0** |
| S3 requests | 20K GETs free | < 1K/month | **₹0** |
| Athena queries | First 1 TB scanned/mo at $5 | ~1 GB/month | **~₹2/mo** |
| Glue crawler | 1 DPU-hour/mo free | < 1 hr/month | **₹0** |

**Total Phase 1 monthly cost: ~₹2.** Basically free.

---

# 🔥 PHASE 2 — OpenSearch (2-3 weeks, ~₹6,000/mo)

**Goal:** Replace your scheme_analytics_snapshot table with an OpenSearch index. Sub-second dashboards.

**Cost reality check:** OpenSearch is the expensive piece. Minimum 1-node t3.small.search instance = ~$45/mo (~₹3,800). For production you want 3 nodes = ~$135/mo (~₹11,000). Plus storage.

**Skip this phase if budget < ₹5,000/mo. MySQL + Athena is enough.**

---

## Step 2.1 — Provision OpenSearch domain

AWS Console → OpenSearch Service → "Create domain":

| Setting | Value |
|---|---|
| Domain name | `mf-analytics` |
| Deployment type | Development (1 AZ) for now |
| Engine | OpenSearch 2.x latest |
| Instance type | `t3.small.search` (free tier eligible for first month!) |
| Number of nodes | 1 |
| Storage | 10 GB EBS GP3 |
| Network | Public access, IP-based |
| Access policy | Restrict to your EC2 IP |

⚠️ **AWS Free Tier** gives 750 hrs/mo of `t3.small.search` for 12 months. So **Phase 2 can be free initially!** Watch for the 12-month mark.

Wait ~15 min for the domain to be active. Note the endpoint URL: `https://search-mf-analytics-xxx.ap-south-1.es.amazonaws.com`

---

## Step 2.2 — Create indices with proper mappings

```python
# backend/app/services/opensearch_setup.py
from opensearchpy import OpenSearch, RequestsHttpConnection
from requests_aws4auth import AWS4Auth
import os, boto3

credentials = boto3.Session().get_credentials()
awsauth = AWS4Auth(
    credentials.access_key, credentials.secret_key,
    os.getenv("AWS_REGION"), 'es',
    session_token=credentials.token,
)

OS = OpenSearch(
    hosts=[{"host": os.getenv("OPENSEARCH_HOST"), "port": 443}],
    http_auth=awsauth,
    use_ssl=True,
    verify_certs=True,
    connection_class=RequestsHttpConnection,
)

NAV_MAPPING = {
    "mappings": {
        "properties": {
            "amfi_code": {"type": "keyword"},
            "scheme_name": {
                "type": "text",
                "fields": {"keyword": {"type": "keyword"}}
            },
            "amc_name": {"type": "keyword"},
            "scheme_category": {"type": "keyword"},
            "nav_date": {"type": "date"},
            "nav": {"type": "scaled_float", "scaling_factor": 10000},
            "return_1y": {"type": "scaled_float", "scaling_factor": 10000},
            "return_3y": {"type": "scaled_float", "scaling_factor": 10000},
            # ... etc
        }
    }
}

OS.indices.create(index="funds-snapshot", body=NAV_MAPPING)
```

⚠️ **Critical:** Use `scaled_float` for ALL monetary fields. Never `float` or `double` — silent precision loss on currency.

---

## Step 2.3 — Sync snapshot data from MySQL → OpenSearch

```python
# backend/app/services/opensearch_sync.py
from opensearchpy.helpers import bulk
from app.database import SessionLocal
from app.models.analytics import SchemeAnalyticsSnapshot

def sync_snapshots_to_opensearch():
    db = SessionLocal()
    snapshots = db.query(SchemeAnalyticsSnapshot).all()

    actions = [
        {
            "_index": "funds-snapshot",
            "_id": s.amfi_code,
            "_source": {
                "amfi_code": s.amfi_code,
                "scheme_name": s.scheme_name,
                "amc_name": s.amc_name,
                "scheme_category": s.scheme_category,
                "latest_nav": float(s.latest_nav or 0),
                "nav_date": s.nav_date.isoformat() if s.nav_date else None,
                "return_1y": float(s.return_1y or 0),
                "return_3y": float(s.return_3y or 0),
                # ...
            }
        }
        for s in snapshots
    ]
    bulk(OS, actions, chunk_size=500)
    db.close()
```

Run after every snapshot refresh:
```python
# In analytics_service.refresh_all_snapshots(), at the end:
sync_snapshots_to_opensearch()
```

---

## Step 2.4 — Replace `/analytics/snapshots` to query OpenSearch instead

```python
# backend/app/routers/analytics.py
@router.get("/snapshots")
def list_snapshots(search: str = None, category: str = None, page: int = 1, page_size: int = 50):
    body = {
        "from": (page - 1) * page_size,
        "size": page_size,
        "query": {"bool": {"must": []}},
        "sort": [{"scheme_category": "asc"}, {"scheme_name.keyword": "asc"}]
    }
    if search:
        body["query"]["bool"]["must"].append({"match": {"scheme_name": search}})
    if category:
        body["query"]["bool"]["must"].append({"term": {"scheme_category": category}})

    result = OS.search(index="funds-snapshot", body=body)
    return {
        "items": [hit["_source"] for hit in result["hits"]["hits"]],
        "total": result["hits"]["total"]["value"],
        "page": page,
        "page_size": page_size,
        "total_pages": (result["hits"]["total"]["value"] + page_size - 1) // page_size,
    }
```

**Expected improvement:**
- MySQL: 300-800ms per query
- OpenSearch: 30-80ms per query
- Search relevance: way better (fuzzy match, typo tolerance)

---

## Step 2.5 — Set up Index Lifecycle Management (ILM)

In OpenSearch Dashboards → Index Management → Policies → "Create policy":

```json
{
  "policy": {
    "description": "Hot 30d, warm 90d, cold (S3-backed) 3y, delete after",
    "states": [
      {"name": "hot", "actions": [], "transitions": [{"state_name": "warm", "conditions": {"min_index_age": "30d"}}]},
      {"name": "warm", "actions": [{"replica_count": {"number_of_replicas": 0}}], "transitions": [{"state_name": "cold", "conditions": {"min_index_age": "90d"}}]},
      {"name": "cold", "actions": [{"cold_migration": {"start_time": "0", "end_time": "now"}}], "transitions": [{"state_name": "delete", "conditions": {"min_index_age": "1095d"}}]},
      {"name": "delete", "actions": [{"delete": {}}]}
    ]
  }
}
```

Saves 80% on storage cost by moving old data to S3 automatically.

---

# 🛠 PHASE 3 — Backend refactor (2 weeks)

**Goal:** Make backend code use the right store for the right job.

| Endpoint | Currently reads from | Will read from |
|---|---|---|
| `/scheme-master` | MySQL | MySQL (unchanged) |
| `/analytics/snapshots` (list) | MySQL `scheme_analytics_snapshot` | OpenSearch `funds-snapshot` |
| `/analytics/scheme/{code}/snapshot` | MySQL | OpenSearch (single doc lookup) |
| `/analytics/scheme/{code}/returns` (chart) | MySQL `nav_price` | OpenSearch OR Athena |
| `/nav/{code}/history` (recent 1y) | MySQL | OpenSearch |
| `/nav/{code}/history` (full history) | MySQL | Athena (cold) |
| `/analytics/summary` (KPIs) | MySQL aggregates | OpenSearch aggregations |
| `/aum/*` | MySQL | MySQL (unchanged — already fast) |
| `/disclosure/*/upload` | MySQL | MySQL (transactional) |

---

## Step 3.1 — Add OpenSearch client dependency

Edit `backend/requirements.txt`:
```
opensearch-py==2.6.0
requests-aws4auth==1.3.1
boto3==1.34.0
pyarrow==15.0.0
```

Rebuild backend container.

---

## Step 3.2 — Define data routing rules

Create `backend/app/services/data_router.py`:

```python
"""Decides which store to query based on data freshness / type."""
from datetime import date, timedelta

def get_nav_history(amfi_code: str, from_date: date, to_date: date):
    """Route NAV history query to the right store."""
    days = (date.today() - from_date).days

    if days <= 90:
        # Hot: from OpenSearch (instant)
        return query_opensearch(amfi_code, from_date, to_date)
    elif days <= 1095:  # 3 years
        # Warm: still OpenSearch (slightly slower)
        return query_opensearch(amfi_code, from_date, to_date)
    else:
        # Cold: from S3 via Athena (cheap but slow)
        return query_athena(amfi_code, from_date, to_date)
```

---

## Step 3.3 — Cleanup MySQL (last, when confident)

After Phase 2 is stable for 2 weeks:

```sql
-- Move historical_nav out of MySQL (already in S3)
TRUNCATE TABLE historical_nav;
-- Keep daily_nav for last 30 days only
DELETE FROM daily_nav WHERE nav_date < CURDATE() - INTERVAL 30 DAY;
-- Keep scheme_analytics_snapshot for fallback
-- (mirror is in OpenSearch)
```

⚠️ **Backup BEFORE TRUNCATE.** Restore plan: re-export from S3 Parquet if needed.

---

# 🛡 PHASE 4 — Hardening (1 week)

## Step 4.1 — Add reconciliation job

Nightly cron compares MySQL vs OpenSearch vs S3 row counts:

```python
@router.post("/admin/reconcile")
def reconcile():
    mysql_count = db.query(SchemeAnalyticsSnapshot).count()
    os_count = OS.count(index="funds-snapshot")["count"]
    s3_count_via_athena = run_query("SELECT COUNT(*) FROM mf_analytics_lake.nav")[0]

    if abs(mysql_count - os_count) > 100:
        alert_admin(f"Drift detected: MySQL={mysql_count}, OS={os_count}")
```

## Step 4.2 — S3 Object Lock (compliance)

For SEBI/regulatory audit trails, lock the `raw/` folder so files can't be deleted for N years.

S3 Console → bucket → Properties → Object Lock → Enable → Compliance mode → 7 years.

## Step 4.3 — Cross-region backup

S3 Replication: copy `mf-analytics-data-yourname-2026` to a US-region bucket for disaster recovery.

## Step 4.4 — Monitoring

CloudWatch dashboards for:
- OpenSearch cluster health
- Athena query failures
- S3 bucket size growth
- Backend API latency

---

# 💰 Total cost projection

| Phase | Setup time | Monthly cost (after free tier) |
|---|---|---|
| **Current** (MySQL only) | done | ₹0 (free tier) → ₹1,500 (after 12 mo) |
| **Phase 1** add: S3 + Athena | 1-2 weeks | +₹50-200 |
| **Phase 2** add: OpenSearch | 2-3 weeks | +₹3,800 (1 node) → ₹11,000 (3 nodes prod) |
| **Phase 3** refactor backend | 2 weeks | (no infra cost) |
| **Phase 4** hardening | 1 week | +₹500 (CloudWatch, replication) |
| **Full setup** | **6-8 weeks** | **₹5,000–15,000/mo** |

---

# 🚦 Decision matrix — should YOU do this?

| Situation | Recommendation |
|---|---|
| < 100 users, < 5M rows | **Don't migrate.** MySQL fine. |
| 100-1000 users, < 50M rows | **Phase 1 only** (S3+Athena for cold storage) |
| 1000+ users, > 50M rows | **Full migration.** Worth the cost. |
| Compliance audit coming up | **Phase 1 (S3 Object Lock)** mandatory |
| CEO insists | Do **Phase 1 as POC**, get budget for Phase 2 |

**Your current scale: ~5 users (CEO + team), 16K schemes, ~3M historical NAVs after 5y backfill.** You don't need Phase 2 yet. **Do Phase 1 only**.

---

# 🎯 The realistic recommendation

## Week 1 — Phase 1 POC (free)
- Create S3 bucket, IAM user, AWS CLI setup
- Export `historical_nav` to S3 Parquet
- Set up Glue crawler + query via Athena
- Show CEO: "Look, querying 5 years of NAV from S3 in 2 seconds, costs ₹2/month"

## Week 2 — Phase 1 integration
- Add `/nav/full-history/{code}` endpoint using Athena
- Frontend "Download full history" button
- Reconciliation script (MySQL count vs Athena count)

## Week 3-4 — Pause and evaluate
- Show CEO the results
- Get budget approval for Phase 2 (OpenSearch) if needed
- If no budget: stop here, you've already added value

## Week 5+ — Phase 2 (only if approved)
- Provision OpenSearch
- Sync snapshots
- Migrate dashboard endpoints

---

# 📝 What to say to your CEO

> Sir, plan ready hai. Step-by-step approach:
>
> **Week 1-2: Phase 1 (free)** — S3 + Athena setup. Historical NAV S3 pe move karenge, Athena se query karenge. MySQL load 70% kam ho jayega. Cost ~₹50-200/month.
>
> **Week 3-4: Demo + decision** — POC dikhata hu, then budget decide karte hain Phase 2 (OpenSearch) ka.
>
> **Week 5-7: Phase 2 (if approved)** — OpenSearch setup karenge for dashboards. ₹4,000-11,000/month extra cost, but dashboards 10x faster honge.
>
> **Week 8: Hardening** — Backup, compliance, monitoring.
>
> Right now mein **Phase 1 start kar dunga**. Phase 2 ka final decision Phase 1 results dekhne ke baad.

This:
- Shows you can deliver
- Doesn't blow budget upfront
- Lets you back out at Phase 2 if data shows it's overkill
- Gives CEO weekly milestones

---

# 🛑 Common mistakes to avoid

1. **Don't drop MySQL data before Phase 2 is stable.** Keep parallel for 2+ weeks.
2. **Don't index every field in OpenSearch.** Be selective — costs storage.
3. **Don't query Athena from frontend.** Latency is 2-30 sec. Use it for downloads/exports only.
4. **Don't use `float` for any money/NAV.** Use `scaled_float` (OS) or `DECIMAL` (MySQL).
5. **Don't skip the reconciliation job.** Distributed systems drift silently.
6. **Don't go straight to 3-node OpenSearch.** Start with 1, scale when needed.

---

# 📂 Files you'll create

```
backend/
├── app/
│   ├── exporters/
│   │   ├── __init__.py
│   │   ├── nav_to_parquet.py        # Phase 1
│   │   └── schema_to_parquet.py     # Phase 1
│   └── services/
│       ├── athena_service.py         # Phase 1
│       ├── opensearch_setup.py       # Phase 2
│       ├── opensearch_sync.py        # Phase 2
│       └── data_router.py            # Phase 3
├── requirements.txt                   # add boto3, opensearch-py, pyarrow
└── .env                               # add AWS keys, OS endpoint
```

That's it. **Start with Phase 1 next week — it's free and validates the entire approach.**
