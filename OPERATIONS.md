# MF Analytics — Operations Guide

Daily-use reference for running, monitoring, and troubleshooting the AWS deployment.

---

## 🌐 Live URLs

| Purpose | URL |
|---|---|
| **Frontend (Dashboard)** | http://13.127.151.21:3000 |
| **Backend API** | http://13.127.151.21:8000 |
| **API Docs (Swagger)** | http://13.127.151.21:8000/docs |
| **Health Check** | http://13.127.151.21:8000/health |
| **Summary** | http://13.127.151.21:8000/analytics/summary |

These run **24/7** on AWS. No setup needed to use them. Just open in browser.

---

## 🪟 vs 🐧 — Two terminals, never confuse them

### 🪟 LAPTOP PowerShell

- **Prompt:** `PS C:\Users\swapn>` (white text, with drive letter)
- **What it is:** Your Windows laptop terminal
- **Use for:** `ssh` (to connect to AWS), `scp` (to upload files). Nothing else.

### 🐧 AWS Ubuntu Terminal (after SSH)

- **Prompt:** `ubuntu@ip-172-31-35-11:~$` (green text, no drive letter)
- **What it is:** The remote AWS Linux server
- **Use for:** Everything — `docker`, `curl http://localhost:...`, `cd`, file edits

### 🚦 Rules

1. If prompt has `PS C:\...` → you're on **laptop**. Only `ssh`/`scp` work.
2. If prompt has `ubuntu@ip-...` → you're on **AWS server**. Everything else works.
3. **Never run `ssh` from inside an SSH session.** Check the prompt first.
4. Most "command not found" errors = wrong terminal or wrong folder.

---

## 🏠 Daily routine — what to run

### 99% of the time: NOTHING

The server runs 24/7. Docker containers auto-restart (`restart: unless-stopped`). Database persists across reboots.

**Just open the URLs in your browser. Done.**

### When you DO want to check/debug

You only need ONE terminal — your laptop PowerShell.

```powershell
# 1. Open PowerShell on laptop (Windows key → "PowerShell" → Enter)

# 2. Connect to AWS server (prompt changes from PS C:\... to ubuntu@ip-...)
ssh -i "C:\Users\swapn\OneDrive\Desktop\Data\analytics-mf\NEWMUTUALFUNDANALYTICS\NEWMUTUALFUNDANALYTICS\mf-analytics-key.pem" -o ServerAliveInterval=60 ubuntu@13.127.151.21

# 3. Always go to project folder first
cd /home/ubuntu/mf-analytics

# 4. Do what you need (see commands below)

# 5. Exit when done
exit
```

---

## 🔧 Common commands (run inside AWS — green prompt)

### Check system health

```bash
docker compose ps                                   # All 3 containers should be "Up"
curl http://localhost:8000/health                   # Should return {"status":"ok"}
curl http://localhost:8000/health/db                # Verifies DB connection
curl http://localhost:8000/analytics/summary        # Shows live row counts
```

### View container logs

```bash
docker logs mf_backend --tail 50                   # Backend logs
docker logs mf_frontend --tail 50                  # Nginx logs
docker logs mf_mysql --tail 50                     # MySQL logs
docker logs mf_backend -f                          # Follow live (Ctrl+C to stop)
```

### Restart containers

```bash
docker compose restart                             # Restart all 3
docker compose restart backend                     # Restart only backend
```

### Stop / Start all

```bash
docker compose down                                # Stop everything (containers stay built)
docker compose up -d                               # Start everything in background
```

### Re-sync data (refresh from AMFI)

```bash
curl -X POST http://localhost:8000/scheme-master/sync                          # Schemes (~30s)
curl -X POST http://localhost:8000/nav/sync                                     # Today's NAV (~10s)
curl -X POST "http://localhost:8000/aum/sync/scheme-wise?fy_id=1&period_id=1"  # AUM
curl -X POST http://localhost:8000/tracking/sync/error                          # Tracking
curl -X POST http://localhost:8000/analytics/refresh-snapshots                  # Recompute analytics (background, ~10 min)
```

Daily NAV also auto-syncs at **9:30 AM IST** via APScheduler — no manual run needed.

### DB queries (direct MySQL access)

```bash
# Row counts
docker exec mf_mysql mysql -uroot -ppassword mutualfund_analytics -e "
SELECT 'scheme_master' t, COUNT(*) n FROM scheme_master
UNION ALL SELECT 'daily_nav', COUNT(*) FROM daily_nav
UNION ALL SELECT 'historical_nav', COUNT(*) FROM historical_nav
UNION ALL SELECT 'average_aum_scheme', COUNT(*) FROM average_aum_scheme
UNION ALL SELECT 'scheme_analytics_snapshot', COUNT(*) FROM scheme_analytics_snapshot;"

# Interactive shell
docker exec -it mf_mysql mysql -uroot -ppassword mutualfund_analytics
# Then run: SHOW TABLES; SELECT * FROM amc_master LIMIT 5; EXIT;
```

### Reboot the OS (only if Ubuntu prompts "system restart required")

```bash
sudo reboot
```

You'll get disconnected. Wait ~2 min, reconnect with the same SSH command. Containers auto-restart.

**⚠️ Use `sudo reboot` (inside SSH) — NOT "stop/start" from AWS console.** Stop/start changes your public IP.

---

## 🚨 Troubleshooting

### "Connection timed out" when SSH'ing
Your home IP changed (common with ISP). Fix:
1. Go to AWS EC2 → Security Groups → your security group → Inbound rules
2. Edit the SSH (port 22) rule → set Source to "Anywhere-IPv4" (or update with new IP)
3. Save, retry SSH

### "Permission denied (publickey)"
You're running `ssh` from inside the AWS server (green prompt). Don't. You're already in.

### `docker compose ps` says "no configuration file provided"
You're in the wrong folder. Run:
```bash
cd /home/ubuntu/mf-analytics
```

### Site is down / containers crashed
```bash
cd /home/ubuntu/mf-analytics
docker compose ps                # Check status
docker compose restart           # Try restart first
docker logs mf_backend --tail 50 # If still broken, check error logs
```

### Out of memory / "Killed" errors
t3.micro is tight on RAM (1 GB). Restart helps:
```bash
docker compose restart
free -h                          # Should show 2 GB swap active
```

### Database is empty after a reboot
Shouldn't happen (data persists in Docker volume), but if it does, re-run the seed APIs (see "Re-sync data" above).

---

## 📤 Sharing with team

### Files to send

From `postman/` folder:
1. `MutualFundAnalytics.postman_collection.json` — 70 endpoints
2. `MutualFundAnalytics.postman_environment.json` — AWS-pointed env

### Instructions for recipient

> 1. Import both files into Postman
> 2. Top-right env dropdown → select "MF Analytics - AWS"
> 3. Click any request → Send → works

---

## 💰 AWS Free Tier reminders

- **t3.micro:** 750 hrs/month free → enough for 24/7 (720 hrs)
- **Free for 12 months** from account creation
- **30 GB EBS storage** included
- **After 12 months:** ~₹1,500/month if you don't move it
- **Public IP:** stays the same as long as you don't STOP the instance from AWS console (reboot inside SSH is fine)

Check billing: https://console.aws.amazon.com/billing

---

## 🗂 File locations

### On your laptop
| Path | What |
|---|---|
| `...\NEWMUTUALFUNDANALYTICS\` | Project root |
| `...\mf-analytics-key.pem` | SSH key (DO NOT lose, DO NOT share) |
| `...\postman\MutualFundAnalytics.postman_collection.json` | Postman collection |
| `...\postman\MutualFundAnalytics.postman_environment.json` | AWS environment |
| `...\postman\MutualFundAnalytics.postman_environment_local.json` | Local-dev backup environment |
| `...\context.md` | Full architectural reference |
| `...\OPERATIONS.md` | This file |

### On AWS server
| Path | What |
|---|---|
| `/home/ubuntu/mf-analytics/` | Project root |
| `/home/ubuntu/mf-analytics/docker-compose.yml` | Container config |
| `/home/ubuntu/mf-analytics/backend/` | FastAPI code |
| `/home/ubuntu/mf-analytics/frontend/` | React code |
| `/home/ubuntu/mf-analytics/uploads/` | Uploaded files (disclosures/portfolios) |
| Docker volume `mf-analytics_mysql_data` | DB data (persistent) |

---

## 🔑 Connection info quick reference

| Item | Value |
|---|---|
| AWS region | Asia Pacific (Mumbai) — `ap-south-1` |
| EC2 Public IP | `13.127.151.21` |
| EC2 instance type | `t3.micro` (Free tier) |
| SSH user | `ubuntu` |
| SSH key | `mf-analytics-key.pem` |
| SSH port | `22` |
| Backend port | `8000` |
| Frontend port | `3000` |
| MySQL port (Docker network) | `3306` (internal) |
| MySQL port (host) | `3307` (mapped externally — not needed) |
| MySQL user / password | `root` / `password` |
| Database name | `mutualfund_analytics` |

---

## 📅 Recommended maintenance

| Frequency | Task |
|---|---|
| Daily | Nothing — system runs itself |
| Weekly | Open dashboard, verify it loads. Optional: re-run `POST /nav/sync` if you want fresh same-day NAV |
| Monthly | `sudo reboot` (optional, clears memory). Check AWS billing dashboard. |
| When code changes | Upload new files via `scp`, then `docker compose up -d --build` on server |
| When you change AWS Public IP | Update `baseUrl` in `MutualFundAnalytics.postman_environment.json` + share with team |

---

## ✅ Quick health check (run anytime)

Three commands tell you everything:

```bash
# On laptop:
ssh -i "C:\Users\swapn\OneDrive\Desktop\Data\analytics-mf\NEWMUTUALFUNDANALYTICS\NEWMUTUALFUNDANALYTICS\mf-analytics-key.pem" -o ServerAliveInterval=60 ubuntu@13.127.151.21

# Inside AWS:
cd /home/ubuntu/mf-analytics && docker compose ps && curl -s http://localhost:8000/analytics/summary
```

All 3 containers Up + a populated JSON response = system fully healthy.
