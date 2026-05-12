# AWS Deployment — Start to End

Complete record of how the MF Analytics project was deployed on AWS Free Tier, what was set up, current state, and how to maintain it.

---

## 🎯 Final state (current — live URLs)

| Resource | Value |
|---|---|
| **Frontend (React UI)** | http://13.127.151.21:3000 |
| **Backend API** | http://13.127.151.21:8000 |
| **Swagger / API docs** | http://13.127.151.21:8000/docs |
| **Health check** | http://13.127.151.21:8000/health |
| **DB health** | http://13.127.151.21:8000/health/db |
| **Analytics summary** | http://13.127.151.21:8000/analytics/summary |

All running 24/7 on AWS. Free Tier eligible for first 12 months.

---

## 📋 Infrastructure summary

| Component | Service | Configuration | Cost |
|---|---|---|---|
| Compute | AWS EC2 | t3.micro (1 vCPU, 1 GB RAM) | Free Tier 12 mo |
| Region | `ap-south-1` | Mumbai | — |
| OS | Ubuntu 24.04 LTS | x86_64 | Free |
| Storage | EBS gp3 | 20 GiB | Free Tier 12 mo |
| Network | Default VPC | Public IP `13.127.151.21` | Free |
| Database | MySQL 8.0 | In Docker container | (part of EC2) |
| Backend | FastAPI 0.115 / Python | In Docker container | (part of EC2) |
| Frontend | nginx serving React | In Docker container | (part of EC2) |
| Process orchestration | Docker Compose | 3 containers | Free |
| Swap | 2 GB swapfile | At `/swapfile` | Free |

**Total monthly cost:** ₹0 first 12 months → ~₹1,500/month after that.

---

## 🔑 Connection details

| Item | Value |
|---|---|
| Public IP | `13.127.151.21` |
| SSH user | `ubuntu` |
| SSH port | `22` |
| SSH key file | `C:\Users\swapn\OneDrive\Desktop\Data\analytics-mf\NEWMUTUALFUNDANALYTICS\NEWMUTUALFUNDANALYTICS\mf-analytics-key.pem` |
| MySQL credentials | `root` / `password` |
| MySQL host port | `3307` (mapped from container's 3306) |
| Database name | `mutualfund_analytics` |
| Backend port | `8000` |
| Frontend port | `3000` |
| Project dir on server | `/home/ubuntu/mf-analytics` |

⚠️ Credentials are dev defaults. Change before any external user gains access.

---

## 🏗 Full deployment timeline (what was done, in order)

### Step 1 — Local Docker setup verified
- Built `docker-compose.yml` with 3 services: mysql, backend, frontend
- Created `.dockerignore` files to exclude `node_modules`, `.venv`, etc. (build context was 200 MB → ~5 MB)
- Local `docker-compose up -d` confirmed working
- Tested all 70 API endpoints + frontend

### Step 2 — AWS account + region setup
- Signed up for AWS account
- Changed region from default (Stockholm) to **Asia Pacific (Mumbai) `ap-south-1`**
- Verified billing dashboard shows Free Tier eligibility

### Step 3 — EC2 instance launched
Via AWS Console → EC2 → Launch Instances:
- **Name:** `mf-analytics`
- **AMI:** Ubuntu Server 24.04 LTS (HVM), SSD Volume Type, 64-bit x86 (Free tier eligible)
- **Instance type:** `t3.micro` (Free tier eligible)
- **Key pair:** Created new `mf-analytics-key` (RSA, .pem) — downloaded
- **VPC:** Default, Auto-assign public IP enabled
- **Storage:** 20 GiB gp3 (within Free Tier's 30 GB limit)

### Step 4 — Security group rules
Inbound rules created:

| Type | Port | Source | Description |
|---|---|---|---|
| SSH | 22 | Anywhere-IPv4 (0.0.0.0/0) | SSH access |
| Custom TCP | 8000 | Anywhere (0.0.0.0/0) | Backend FastAPI |
| Custom TCP | 3000 | Anywhere (0.0.0.0/0) | Frontend nginx |

(Initially SSH was restricted to "My IP" — relaxed to Anywhere after the home IP changed and SSH was locked out. Acceptable for now because authentication is by .pem key, not password.)

### Step 5 — Connected to server via SSH
From Windows PowerShell:
```powershell
icacls "C:\Users\swapn\OneDrive\Desktop\Data\analytics-mf\NEWMUTUALFUNDANALYTICS\NEWMUTUALFUNDANALYTICS\mf-analytics-key.pem" /inheritance:r /grant:r "$($env:USERNAME):(R)"

ssh -i "C:\Users\swapn\OneDrive\Desktop\Data\analytics-mf\NEWMUTUALFUNDANALYTICS\NEWMUTUALFUNDANALYTICS\mf-analytics-key.pem" -o ServerAliveInterval=60 ubuntu@13.127.151.21
```

### Step 6 — Server provisioning
On the AWS Ubuntu server:

```bash
# System update
sudo apt update && sudo apt upgrade -y

# Git
sudo apt install -y git

# Docker + Docker Compose
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow docker without sudo
sudo usermod -aG docker $USER
newgrp docker

# Critical: 2 GB swap for t3.micro's 1 GB RAM
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Step 7 — Project upload (from laptop)

First attempt with `scp -r` (uploaded `.venv` accidentally — slow):
```powershell
scp -i "...mf-analytics-key.pem" -r "...\NEWMUTUALFUNDANALYTICS" ubuntu@13.127.151.21:/home/ubuntu/mf-analytics
```
**Cancelled and switched to compressed upload.**

Working method — compress first (excludes heavy folders):
```powershell
cd "C:\Users\swapn\OneDrive\Desktop\Data\analytics-mf\NEWMUTUALFUNDANALYTICS"
tar --exclude='*/node_modules' --exclude='*/.venv' --exclude='*/__pycache__' --exclude='*/.git' --exclude='*/dist' -czf mf-project.tar.gz NEWMUTUALFUNDANALYTICS

scp -i "...mf-analytics-key.pem" mf-project.tar.gz ubuntu@13.127.151.21:/home/ubuntu/
```
Tar size: ~8.4 MB. Upload took < 1 min.

### Step 8 — Extract on server + cleanup
```bash
rm -rf /home/ubuntu/mf-analytics
cd /home/ubuntu
tar -xzf mf-project.tar.gz
mv NEWMUTUALFUNDANALYTICS mf-analytics
rm /home/ubuntu/mf-analytics/mf-analytics-key.pem   # cleanup .pem from upload
```

### Step 9 — Port conflict resolved
Initial run failed because port `3306` already taken on host. Edited `docker-compose.yml`:
```yaml
# Changed
- "3306:3306"
# To
- "3307:3306"
```
Now Docker MySQL exposed on host port 3307 instead.

### Step 10 — Build + start containers
```bash
cd /home/ubuntu/mf-analytics
docker compose build --no-cache    # ~10 min on t3.micro
docker compose up -d
```

First start had MySQL initialization race condition (backend tried to connect during MySQL's temp-server → real-server transition). Fixed by:
```bash
docker compose down
docker compose up -d   # second start works because DB volume already initialized
```

Verified:
```bash
docker compose ps
# 3 containers Up, mf_mysql showing (healthy)

curl http://localhost:8000/health
# {"status":"ok"}
```

### Step 11 — Seeded the database

Ran sync APIs in order (~3 min total):
```bash
curl -X POST http://localhost:8000/scheme-master/sync                                # ~30s
curl -X POST http://localhost:8000/nav/sync                                          # ~10s
curl -X POST "http://localhost:8000/aum/sync/scheme-wise?fy_id=1&period_id=1"        # ~5s
curl -X POST "http://localhost:8000/aum/sync/fund-wise?fy_id=1&period_id=1"          # ~5s
curl -X POST http://localhost:8000/tracking/sync/error                               # ~10s
curl -X POST http://localhost:8000/tracking/sync/difference                          # ~10s
curl -X POST http://localhost:8000/analytics/refresh-snapshots                       # background ~15 min
```

Triggered historical NAV bulk fetch (background ~45 min):
```bash
curl -X POST "http://localhost:8000/nav/historical/bulk-fetch-all?from_year=2024"
```

### Step 12 — Fixed the `nav_price` VIEW bug
Discovered that SQLAlchemy `create_all()` created `nav_price` as an empty TABLE instead of as a VIEW. This caused all snapshot-based fields (latest_nav, returns) to be NULL after refresh.

Fix:
```bash
docker exec -i mf_mysql mysql -uroot -ppassword mutualfund_analytics <<'SQL'
DROP TABLE IF EXISTS nav_price;
CREATE VIEW nav_price AS
SELECT id, amfi_code, isin_div_payout_growth, isin_div_reinvestment, scheme_name, nav, repurchase_price, sale_price, nav_date, 'DAILY' AS source_type, 100 AS source_priority, created_at FROM daily_nav
UNION ALL
SELECT id + 10000000000, amfi_code, isin_div_payout_growth, isin_div_reinvestment, scheme_name, nav, repurchase_price, sale_price, nav_date, 'HISTORICAL' AS source_type, 50 AS source_priority, created_at FROM historical_nav;
SQL
```

Then re-ran `POST /analytics/refresh-snapshots`. After ~15 min: all snapshots populated correctly.

### Step 13 — Verified end-to-end
- Dashboard at `http://13.127.151.21:3000` rendered all KPIs
- Active Schemes: 16,366
- Total AMCs: 53
- Industry AUM: ₹81.54L Cr
- Latest NAV Date: 2026-05-10
- Schemes with NAV: 14,368
- Schemes with Returns: 8,016
- All sidebar pages clickable and populated

### Step 14 — Postman environment updated
Edited `postman/MutualFundAnalytics.postman_environment.json`:
- Renamed env from "MF Analytics - Local" → "MF Analytics - AWS"
- Changed `baseUrl` from `http://localhost:8000` to `http://13.127.151.21:8000`
- Created backup `postman/MutualFundAnalytics.postman_environment_local.json` for local dev

Sent to CEO with instructions to import + select "MF Analytics - AWS" environment.

---

## 📂 What's where on AWS

### File system layout
```
/home/ubuntu/
├── mf-analytics/                          ← project root
│   ├── docker-compose.yml
│   ├── backend/
│   │   ├── Dockerfile
│   │   ├── app/                           ← FastAPI source
│   │   ├── alembic/                       ← migrations
│   │   ├── requirements.txt
│   │   └── uploads/                       ← runtime uploads
│   ├── frontend/
│   │   ├── Dockerfile
│   │   ├── nginx.conf
│   │   └── (built React assets)
│   ├── mysql-init/
│   │   └── 01_init.sql                    ← DB init
│   ├── postman/                           ← Postman files
│   ├── context.md                         ← architecture doc
│   ├── OPERATIONS.md                      ← daily ops guide
│   └── (other .md docs)
└── mf-project.tar.gz                      ← original upload archive
```

### Docker volumes
- `mf-analytics_mysql_data` — persists MySQL data across container restarts. **Do not delete unless re-seeding.**

### Container names
- `mf_mysql` (MySQL 8.0)
- `mf_backend` (FastAPI)
- `mf_frontend` (nginx)

---

## 🔄 Daily routine — what you actually need to do

### 99% of the time: nothing
The 3 containers run 24/7 with `restart: unless-stopped`. The data persists across reboots. Just use the URLs.

### To reconnect to server (when troubleshooting)
```powershell
ssh -i "C:\Users\swapn\OneDrive\Desktop\Data\analytics-mf\NEWMUTUALFUNDANALYTICS\NEWMUTUALFUNDANALYTICS\mf-analytics-key.pem" -o ServerAliveInterval=60 ubuntu@13.127.151.21
```

Then always `cd /home/ubuntu/mf-analytics` before any docker command.

### Common operations
| Need | Command |
|---|---|
| Check container status | `docker compose ps` |
| Restart everything | `docker compose restart` |
| Check backend logs | `docker logs mf_backend --tail 50` |
| Check MySQL logs | `docker logs mf_mysql --tail 50` |
| Run a one-off SQL | `docker exec mf_mysql mysql -uroot -ppassword mutualfund_analytics -e "SELECT COUNT(*) FROM scheme_master;"` |
| Re-sync NAV | `curl -X POST http://localhost:8000/nav/sync` |
| Re-compute snapshots | `curl -X POST http://localhost:8000/analytics/refresh-snapshots` |
| Stop everything | `docker compose down` |
| Start everything | `docker compose up -d` |

### Reboot OS (only if Ubuntu prompts "System restart required")
```bash
sudo reboot
```
You'll get disconnected. Wait ~2 min. Reconnect. Containers auto-restart.
**Do NOT** use AWS Console's "Stop instance" — that changes public IP.

---

## 🛡 Backup strategy

### MySQL backup (manual — do before any risky change)
```bash
docker exec mf_mysql mysqldump -uroot -ppassword mutualfund_analytics > /tmp/backup_$(date +%Y%m%d).sql
ls -lh /tmp/backup_*.sql
```

### Project code backup
Already on your laptop at `C:\Users\swapn\OneDrive\Desktop\Data\analytics-mf\NEWMUTUALFUNDANALYTICS\` and OneDrive syncs it.

### Restore MySQL from backup
```bash
docker exec -i mf_mysql mysql -uroot -ppassword mutualfund_analytics < /tmp/backup_YYYYMMDD.sql
```

---

## 💰 Cost monitoring

### How to check
1. AWS Console → top-right account name → **Billing & Cost Management**
2. "Bills" → current month should show $0.00 or near it

### What to watch for
- EC2 hours: should stay around 720/month (24/7 for 30 days)
- Free Tier expiration: 12 months from account creation
- Any service showing > $0.50: investigate

### Free Tier limits being used
- ✅ EC2 t3.micro: 720/750 hrs/month (using ~96%)
- ✅ EBS gp3: 20/30 GB
- ✅ Data transfer: < 1 GB/month (within 1 GB free)
- ✅ Public IP: same instance running 24/7 (free if attached to running instance)

### What stops being free after 12 months
| Service | Free now | After 12 mo |
|---|---|---|
| EC2 t3.micro 24/7 | ₹0 | ~₹1,500/month |
| EBS gp3 20 GB | ₹0 | ~₹50/month |
| Data transfer | ₹0 | ₹0 (within 100 GB/month for outbound) |
| **Total** | **₹0/month** | **~₹1,550/month** |

Set a calendar reminder for **11 months from account creation** to decide: keep paying, or terminate.

---

## 🚨 Troubleshooting (common issues seen during deployment)

### "Connection timed out" when SSH'ing
Home IP changed. Fix: AWS Console → EC2 → Security Groups → edit SSH rule → set Source to "Anywhere-IPv4" (or update with new "My IP").

### "Permission denied (publickey)"
You ran SSH from inside the AWS server (already SSH'd in). Just type commands at the existing prompt.

### `docker compose ps` says "no configuration file provided"
Wrong folder. Run:
```bash
cd /home/ubuntu/mf-analytics
```

### "Connection refused 127.0.0.1:8000" in Postman
Backend isn't running. Check:
```bash
docker compose ps                  # see if mf_backend is Up
docker compose up -d               # restart if needed
```

### `latest_nav_date: null` in summary
The `nav_price` was created as an empty TABLE. Run the VIEW fix from Step 12 above.

### Out of memory / OOM kill
t3.micro is tight on RAM. Check:
```bash
free -h                             # should show 2 GB swap
docker stats --no-stream
```
If swap is full and processes dying: restart containers and consider t3.small upgrade.

### Snapshot refresh takes forever
Expected on t3.micro — 10-15 min normal. To speed up, apply CHANGES_TO_APPLY.md → Fix #6.

### AMFI sync returns 0 records
Not a deployment issue. AMFI sometimes doesn't publish for current period. Try older date.

---

## 🔒 Security checklist (for production-readiness)

Current state is **DEMO-grade**. Before exposing to real external users:

- [ ] Change MySQL `root` password from `password`
- [ ] Change `SECRET_KEY` in `.env` from `dev-secret-key`
- [ ] Add authentication layer (currently zero auth)
- [ ] Rate-limit `POST /scheme-master/sync`, `POST /aum/sync/bulk`, etc. (DoS risk)
- [ ] Restrict CORS origins (currently allows `localhost`)
- [ ] Lock SSH security group back to a stable IP or VPN
- [ ] Enable AWS CloudTrail for audit
- [ ] Set CloudWatch billing alert at ₹500/month
- [ ] Periodic security updates: `sudo apt update && sudo apt upgrade`
- [ ] Backup automation (currently manual)

---

## 📁 Documentation generated during this deployment

All in `/home/ubuntu/mf-analytics/` (on server) and `C:\Users\swapn\OneDrive\Desktop\Data\analytics-mf\NEWMUTUALFUNDANALYTICS\NEWMUTUALFUNDANALYTICS\` (laptop):

| File | What it contains |
|---|---|
| `context.md` | Full architecture: 70 endpoints, 24 tables, services, parsers |
| `OPERATIONS.md` | Daily ops: terminals, commands, troubleshooting |
| `DATA_INGESTION_NOTES.md` | Which API populates which table, timings, dependencies |
| `FETCH_TIMINGS.md` | Per-field load times on frontend |
| `PERFORMANCE_OPTIMIZATIONS.md` | High-level performance suggestions |
| `CODE_LEVEL_OPTIMIZATIONS.md` | Code-specific bottleneck analysis (10 problems) |
| `HYBRID_LAKEHOUSE_PLAN.md` | Future: S3 + OpenSearch + Athena phased migration plan |
| `CHANGES_TO_APPLY.md` | **The 6 specific fixes to apply for performance** (companion to this file) |
| `aws.md` | This file |

---

## 🎯 What's next

After deployment, the recommended path is:

1. **Apply the 6 fixes in `CHANGES_TO_APPLY.md`** — no infrastructure change needed, 6.5 hours of dev work, snapshot refresh drops from 15 min → 1-2 min.

2. **If/when budget approved:** Phase 1 of the lakehouse plan (S3 + Athena for historical NAV) — see `HYBRID_LAKEHOUSE_PLAN.md`. Free tier mostly covers it.

3. **Phase 2 (OpenSearch)** — only if user base grows significantly. Costs ₹3,000-11,000/month.

4. **Security hardening** — before any external user gets the URL, complete the security checklist above.

---

## 📞 Hand-off info

Anyone taking over this deployment needs:

1. **AWS account credentials** — login email + password (or use IAM user)
2. **`.pem` key file** — location on laptop or backup copy
3. **Public IP** — currently `13.127.151.21`
4. **These docs** — especially `OPERATIONS.md` and this file
5. **MySQL credentials** — `root` / `password`
6. **GitHub repo or current code archive** — currently in laptop OneDrive

---

## ✅ Summary in 3 lines

- **Deployed:** FastAPI + React + MySQL on AWS EC2 t3.micro (Free Tier), region Mumbai, IP `13.127.151.21`.
- **Live URLs:** Frontend `:3000`, Backend `:8000`, Swagger `:8000/docs`. All 24/7.
- **Status:** Production-quality demo. Database seeded with 16,366 schemes + analytics. Cost ₹0/mo for 12 months, then ~₹1,550/mo.
