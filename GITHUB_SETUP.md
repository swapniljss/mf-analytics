# GitHub Setup — Connecting This Project to GitHub

How to push your existing project to GitHub safely, without breaking the live AWS production server.

---

## ⚠️ READ THIS FIRST — Critical safety rules

> **The production server (AWS at `13.127.151.21`) is currently running 100% independently of Git.** Setting up GitHub does NOT change anything on the server. We're just:
>
> 1. Creating a backup of your code on GitHub (one-time push from your laptop)
> 2. Setting up a way to deploy future changes via `git pull` (optional)
>
> The live server keeps running while you do this. **Nothing on AWS gets touched.**

### Files that must NEVER go to GitHub

These contain secrets / credentials. If they leak publicly, you'll lose AWS access or worse:

| File | Why dangerous |
|---|---|
| `mf-analytics-key.pem` | SSH private key — anyone with this can log into your AWS server |
| `backend/.env` | Has MySQL password, SECRET_KEY |
| `frontend/.env*` (if any) | API keys |
| `*.sql` backup files | Real customer data |
| `node_modules/`, `.venv/` | Huge, regenerable, not source |
| `backend/uploads/` | Runtime user uploads |

The `.gitignore` we'll create blocks all these automatically.

---

## 📋 What you need before starting

| # | Item | Where |
|---|---|---|
| 1 | A GitHub account | https://github.com/signup (free) |
| 2 | Git installed on Windows | https://git-scm.com/download/win |
| 3 | Your laptop terminal | PowerShell or Git Bash |
| 4 | 30 minutes | First-time setup |

Verify Git is installed:
```powershell
git --version
```
Should print `git version 2.x.x`. If not, install from link above.

---

# 🚀 Step-by-step setup

## Step 1 — Configure Git with your identity (one-time)

In PowerShell on your laptop:

```powershell
git config --global user.name "Swapnil Jagtap"
git config --global user.email "rutuj.jagtap@sahisavings.com"
```

Use your real name + the email tied to your GitHub account. This appears on every commit.

Verify:
```powershell
git config --global --list
```

---

## Step 2 — Create `.gitignore` (BEFORE adding any files)

This is the **most critical step.** It tells Git what NOT to upload.

Create file at the project root: `C:\Users\swapn\OneDrive\Desktop\Data\analytics-mf\NEWMUTUALFUNDANALYTICS\NEWMUTUALFUNDANALYTICS\.gitignore`

Paste this content:

```gitignore
# ==== SECRETS / KEYS — NEVER COMMIT ====
*.pem
*.key
*.crt
*.cert
.env
.env.local
.env.*.local
**/.env
secrets/

# Python
__pycache__/
*.pyc
*.pyo
*.pyd
.venv/
venv/
.pytest_cache/
.mypy_cache/
.coverage
htmlcov/

# Node / Frontend build
node_modules/
dist/
build/
.eslintcache
.parcel-cache/

# Backend uploads (runtime user data — not source code)
backend/uploads/
backend/uploads/*
!backend/uploads/.gitkeep

# Logs
*.log
nps_bulk_loader.log

# Database backups / dumps
*.sql.gz
*.sql.zip
backup_*.sql
dump_*.sql

# OS / IDE
.DS_Store
Thumbs.db
.idea/
.vscode/
*.swp
*.swo
*~

# Docker volumes / compose overrides
docker-compose.override.yml

# Mac extras
.AppleDouble
.LSOverride

# Local config
*.local
.local/
```

This blocks 99% of accidental leaks.

---

## Step 3 — Initialize Git in your project folder

Open PowerShell and `cd` into your project:

```powershell
cd "C:\Users\swapn\OneDrive\Desktop\Data\analytics-mf\NEWMUTUALFUNDANALYTICS\NEWMUTUALFUNDANALYTICS"
```

Verify you're in the right place:
```powershell
dir
```
Should show `backend/`, `frontend/`, `docker-compose.yml`, `context.md`, etc.

Initialize Git:
```powershell
git init -b main
```

This creates a hidden `.git` folder. Git now tracks this directory.

---

## Step 4 — Sanity check: confirm secrets are excluded

Before committing anything, verify `.gitignore` is working:

```powershell
git status --ignored
```

In the output, look for:
- ✅ `mf-analytics-key.pem` should appear under **"Ignored files"**
- ✅ `backend/.env` should appear under **"Ignored files"**
- ✅ `node_modules/`, `.venv/` (if present) should be ignored

If `mf-analytics-key.pem` shows up under "Untracked files" instead of "Ignored files" → STOP. Edit `.gitignore` and re-check before continuing.

---

## Step 5 — Stage and commit

```powershell
git add .
git status
```

Look at the output carefully. **Confirm none of these appear:**
- ❌ `mf-analytics-key.pem`
- ❌ `backend/.env`
- ❌ Anything containing real passwords

If you see any of these — DO NOT continue. Run:
```powershell
git rm --cached <file>
```
to unstage, fix `.gitignore`, then `git add .` again.

When clean:
```powershell
git commit -m "Initial commit: Mutual Fund Analytics platform"
```

---

## Step 6 — Create a GitHub repository

In your browser:

1. Go to https://github.com/new
2. Fill in:
   - **Repository name:** `mutual-fund-analytics` (or whatever you like)
   - **Description:** `AMFI mutual fund analytics platform with NPS support`
   - **Visibility:** ⚠️ **Private** (recommended) — your code, your data
   - ❌ Do NOT initialize with README, .gitignore, or license — your repo already has these
3. Click **Create repository**

GitHub shows you a page with commands. **Copy the URL** of your new repo. It looks like:
```
https://github.com/yourusername/mutual-fund-analytics.git
```

---

## Step 7 — Connect local repo to GitHub

In PowerShell:

```powershell
git remote add origin https://github.com/yourusername/mutual-fund-analytics.git
git branch -M main
git push -u origin main
```

First time it'll prompt for credentials:

### Option A — Browser sign-in (easiest)
If you have Git Credential Manager installed (default on modern Git for Windows), a browser opens for you to log into GitHub. Click Authorize. Done.

### Option B — Personal Access Token (if browser doesn't open)
GitHub no longer accepts passwords for HTTPS push. You need a Personal Access Token (PAT):

1. Go to https://github.com/settings/tokens/new
2. **Note:** `mf-analytics-laptop-push`
3. **Expiration:** 90 days
4. **Scopes:** ✅ check `repo` (full control of private repos)
5. **Generate token** — **COPY THE TOKEN IMMEDIATELY** (you can't see it again)

When git prompts for password, paste the **token** instead of your GitHub password.

---

## Step 8 — Verify upload succeeded

```powershell
git remote -v
```
Shows the remote URL.

```powershell
git log --oneline
```
Shows your commit.

Visit your repo in browser: `https://github.com/yourusername/mutual-fund-analytics`

You should see all your files (backend, frontend, docs) **EXCEPT** the ignored ones (.env, .pem, node_modules, .venv).

Double-check the file list — confirm `.env` and `.pem` are NOT there.

---

# 🛡 SAFETY VALIDATION

After the push, run this in PowerShell to be 100% sure no secrets leaked:

```powershell
git ls-files | Select-String -Pattern "\.env$|\.pem$|\.key$|password|secret"
```

If the output is **empty** → ✅ you're safe.

If anything shows up → ⚠️ STOP. Tell me which file leaked and we'll remove it from history.

---

# 🔄 How to use GitHub going forward

## Daily workflow on your laptop

When you change code:
```powershell
cd "C:\Users\swapn\OneDrive\Desktop\Data\analytics-mf\NEWMUTUALFUNDANALYTICS\NEWMUTUALFUNDANALYTICS"

# See what changed
git status
git diff

# Stage + commit
git add .
git commit -m "Brief description of what you changed"

# Push to GitHub
git push
```

That's it. Every push backs up your code to GitHub.

---

## Deploying changes to the AWS server (TWO options)

You asked: *"once we connect to GitHub what we need to take care and how?"*

You have a choice for how to push changes to the live AWS server.

### Option 1 — KEEP USING SCP (current method, no risk)

Continue what you did during deployment:
```powershell
# On laptop: rebuild the tar
cd "C:\Users\swapn\OneDrive\Desktop\Data\analytics-mf\NEWMUTUALFUNDANALYTICS"
tar --exclude='*/node_modules' --exclude='*/.venv' --exclude='*/__pycache__' --exclude='*/.git' --exclude='*/dist' -czf mf-project.tar.gz NEWMUTUALFUNDANALYTICS

# Upload
scp -i "...pem" mf-project.tar.gz ubuntu@13.127.151.21:/home/ubuntu/

# On server: extract + rebuild
ssh -i "...pem" ubuntu@13.127.151.21
cd /home/ubuntu
tar -xzf mf-project.tar.gz   # overwrites mf-analytics folder
mv NEWMUTUALFUNDANALYTICS/* mf-analytics/   # or similar
cd mf-analytics
docker compose up -d --build
```

**Pros:** No new setup. Same as what already works.
**Cons:** Manual every time. Slower.

### Option 2 — GIT-BASED DEPLOY (recommended for future)

Set up the AWS server to pull from GitHub. Then deploys become **one command**.

**One-time setup on the AWS server:**

```bash
# SSH into AWS
ssh -i "...pem" ubuntu@13.127.151.21

cd /home/ubuntu

# Backup current code (safety net)
sudo cp -r mf-analytics mf-analytics-backup-$(date +%Y%m%d)

# Clone fresh from GitHub
# For PRIVATE repo: needs a Personal Access Token
git clone https://YOUR_GITHUB_TOKEN@github.com/yourusername/mutual-fund-analytics.git mf-analytics-git

# Or for PUBLIC repo: just URL
# git clone https://github.com/yourusername/mutual-fund-analytics.git mf-analytics-git

# Copy the .env file from old folder (NOT in git!)
cp /home/ubuntu/mf-analytics/backend/.env /home/ubuntu/mf-analytics-git/backend/.env

# Stop old containers
cd /home/ubuntu/mf-analytics
docker compose down

# Switch to new folder
cd /home/ubuntu
mv mf-analytics mf-analytics-old
mv mf-analytics-git mf-analytics

# Start fresh from cloned code
cd mf-analytics
docker compose up -d --build
```

**Future deploys become:**
```bash
ssh -i "...pem" ubuntu@13.127.151.21
cd /home/ubuntu/mf-analytics
git pull
docker compose up -d --build
```

Three commands. Done.

---

## What to be careful about — going forward

### ⚠️ Critical — the .env files

`.env` files contain DB passwords. They're in `.gitignore` so they don't go to GitHub. **But that means the server's `.env` is NOT in your repo.**

Implication: If you wipe the server and re-clone, you must **manually recreate** `.env` from your local copy. Otherwise the backend won't connect to MySQL.

**Solution:** Keep a `.env.example` file in the repo (template without real values):
```env
# backend/.env.example  — this DOES get committed
DATABASE_URL=mysql+pymysql://root:CHANGE_ME@mysql:3306/mutualfund_analytics?charset=utf8mb4
SECRET_KEY=CHANGE_ME_TO_A_RANDOM_STRING
UPLOAD_DIR=/app/uploads
LOG_LEVEL=INFO
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

When deploying, you `cp .env.example .env` and fill in real values on the server.

### ⚠️ Never commit and force-push secrets

If you ever accidentally commit `.env` or `.pem`:

1. **Rotate the secret immediately** (change MySQL password, regenerate SSH key, etc.) — assume it's leaked
2. Remove from history:
   ```powershell
   git rm --cached backend/.env
   git commit -m "Remove leaked env"
   git push
   ```
3. To purge from past commits entirely, use `git filter-repo` or `BFG Repo-Cleaner` — complex; better to just rotate the secret

### ⚠️ Branch protection (for team setups)

If multiple devs will push, on GitHub:
- Settings → Branches → Add rule for `main`
- Require pull requests before merging
- Require status checks

For solo dev, you can skip this.

### ⚠️ Don't `git pull` on the server while seeding

If a snapshot refresh or bulk fetch is running, **don't deploy.** Wait for it to finish, otherwise you might restart the backend mid-job.

Check first:
```bash
docker logs mf_backend --tail 20 | grep -i "refresh\|fetch"
```

### ⚠️ Keep the `.pem` file safe

The SSH key (`mf-analytics-key.pem`) is NOT in Git. It's only on your laptop. **If you lose it, you cannot SSH to AWS anymore.** Back it up to:
- An encrypted USB drive
- Password manager (Bitwarden, 1Password)
- NOT to GitHub, NOT to Google Drive (unless encrypted)

---

## 🚦 Deployment safety checklist

Before pushing changes to production (any deploy method):

- [ ] Local `docker-compose up -d` works on laptop
- [ ] All 70 API endpoints tested in Postman locally
- [ ] No `.env` or `.pem` in `git status` output
- [ ] Migration plan ready if DB schema changed
- [ ] Backup current DB:
  ```bash
  docker exec mf_mysql mysqldump -uroot -ppassword mutualfund_analytics > backup_$(date +%Y%m%d).sql
  ```
- [ ] Commit and push to GitHub first (so there's a remote backup)
- [ ] Deploy during low-traffic hours (or any time for now since you're solo)

---

# 📋 Quick reference — common commands

| Task | Command |
|---|---|
| First-time GitHub setup | (see Step 1-7 above) |
| Check what changed | `git status` |
| See diff in detail | `git diff` |
| Commit changes | `git add . ; git commit -m "..."` |
| Push to GitHub | `git push` |
| Pull latest from GitHub | `git pull` |
| See commit history | `git log --oneline` |
| Undo uncommitted changes | `git checkout -- <file>` |
| Undo last commit (keep changes) | `git reset --soft HEAD~1` |
| List ignored files | `git status --ignored` |
| What's tracked | `git ls-files` |
| Server deploy (Option 2) | `ssh ... ; cd mf-analytics ; git pull ; docker compose up -d --build` |

---

# 🎯 Recommended path for you

### Today (30 min)
1. Install Git + create GitHub account if needed (5 min)
2. Steps 1-8 above — push your code to a **private** GitHub repo (15 min)
3. Verify no secrets leaked (5 min)

### This week (no urgency)
4. Create `.env.example` files in `backend/` and `frontend/` and commit them
5. Update `aws.md` to add: "Code backed up at https://github.com/yourusername/..."
6. Bookmark your GitHub repo URL

### Next deploy
7. Try Option 2 (git pull on server) — set it up alongside Option 1 (scp) so you can fall back if something breaks

### What stays the same
- ✅ AWS server keeps running
- ✅ URLs unchanged (`13.127.151.21:3000` / `:8000`)
- ✅ Postman collection works
- ✅ Database untouched
- ✅ Users see no difference

---

# 🛑 What if you mess up?

| Mistake | Fix |
|---|---|
| Committed `.env` to GitHub | (1) Rotate password in real `.env` (2) `git rm --cached backend/.env` (3) commit + push (4) consider repo private and use BFG to purge history |
| Committed `.pem` to GitHub | Same as above. Plus: regenerate SSH key in AWS (you'll be locked out until done) |
| `git push` rejected (no permission) | Check PAT not expired. Regenerate at https://github.com/settings/tokens |
| Server's old code is broken after `git pull` | `git reset --hard <previous-commit-hash>` to roll back, then re-deploy old version |
| Local commit you don't want | `git reset --soft HEAD~1` (keeps your file changes) or `git reset --hard HEAD~1` (discards them) |
| Forgot `.gitignore`, pushed `node_modules` | Add to `.gitignore`, then `git rm -r --cached node_modules`, commit, push |

---

# 💡 TL;DR

| Question | Answer |
|---|---|
| Will pushing to GitHub affect the live server? | **No.** Server runs independently. GitHub is just a code backup. |
| Do I need to redeploy after pushing? | **No.** Server stays as-is. |
| Will my secrets leak? | **No** — IF you use the `.gitignore` from Step 2 and verify in Step 4. |
| How do I deploy changes after this? | EITHER continue with scp+tar (works fine), OR set up `git pull` on server (one-time setup, faster after). |
| Should I make the repo public or private? | **Private** — your code, your data, your competitive advantage. |
| What if I want to use a different name on GitHub? | Anywhere I wrote `yourusername` and `mutual-fund-analytics`, replace with your actual values. |

**Action plan for now:** Just do Steps 1-8 above. Push code to private GitHub. Server keeps running. You're done.
