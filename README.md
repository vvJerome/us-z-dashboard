# us-z-dashboard

Universal scraper platform for running long-running JSONL/CSV scraper jobs from a shared web dashboard.

---

## Architecture

| Layer        | Technology                                   |
|--------------|----------------------------------------------|
| Dashboard    | React 18 + Vite + TanStack Query + Tailwind  |
| Backend      | FastAPI + SQLAlchemy 2.x + Alembic           |
| Orchestrator | Kestra self-hosted (concurrency limit: 1)    |
| Pipeline     | Docker container — `us-z-3` (Python 3.12)   |
| Storage      | PostgreSQL 16 + local `/data` volume         |
| Infra        | Docker Compose on Racknerd KVM-2GB VPS       |

---

## Local development

> **macOS limitation**: Kestra cannot spawn Docker containers locally because Docker Desktop runs inside a VM. The full job-execution path only works on a Linux host. Everything else (backend, dashboard, migrations, flow upload) works locally.

**Prerequisites**: Docker Desktop, Docker Compose v2

```bash
# Clone
git clone git@github-viableview:vvJerome/us-z-dashboard.git && cd us-z-dashboard

# Create .env
cp .env.template .env
# Edit .env — fill in POSTGRES_PASSWORD, JWT_SECRET_KEY, KESTRA_WEBHOOK_KEY,
#             GITHUB_ORG=vvjerome (lowercase), and all API keys

# Create placeholder SSH key (required for Kestra container mount)
mkdir -p ~/.ssh
ssh-keygen -t ed25519 -f ~/.ssh/racknerd_egress -N "" -C "placeholder-local"
# Set RACKNERD_SSH_KEY_PATH=~/.ssh/racknerd_egress in .env

# Start all services
docker compose up -d

# Apply migrations
docker compose exec backend sh -c "cd /srv/backend && PYTHONPATH=/srv alembic upgrade head"

# Insert the placeholder user (required — backend uses a fixed UUID until auth is wired)
docker compose exec postgres psql -U scraper -d scraper -c \
  "INSERT INTO users (id, email, password_hash, created_at)
   VALUES ('00000000-0000-0000-0000-000000000001', 'jerome@viableview.us', 'placeholder-no-auth-yet', now())
   ON CONFLICT DO NOTHING;"

# Upload the Kestra flow
curl -X POST http://localhost:8080/api/v1/flows/import \
  -F fileUpload=@kestra/flows/run-scraper.yml

# Run smoke tests (expect 5/5 pass)
bash scripts/smoke-test.sh
```

**Access URLs:**

| Service   | URL                   |
|-----------|-----------------------|
| Dashboard | http://localhost:3000 |
| Kestra UI | http://localhost:8080 |

---

## VPS deployment (Racknerd KVM-2GB)

### One-time server setup

```bash
# 1. Install Docker
apt-get update && apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 2. Add swap (prevents Kestra OOM on 2 GB RAM)
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl vm.swappiness=10 && echo 'vm.swappiness=10' >> /etc/sysctl.conf

# 3. Create placeholder SSH key for Kestra mount
mkdir -p /root/.ssh && chmod 700 /root/.ssh
ssh-keygen -t ed25519 -f /root/.ssh/racknerd_egress -N "" -C "placeholder"
```

### Deploy

```bash
# Clone
git clone https://github.com/vvJerome/us-z-dashboard.git /opt/us-z-dashboard
cd /opt/us-z-dashboard

# Create .env (fill in all values — see .env.template)
cp .env.template .env
nano .env

# Pull and start (GHCR packages are public — no docker login needed)
docker compose pull
docker compose up -d

# Apply migrations
docker compose exec backend sh -c "cd /srv/backend && PYTHONPATH=/srv alembic upgrade head"

# Insert placeholder user
docker compose exec postgres psql -U scraper -d scraper -c \
  "INSERT INTO users (id, email, password_hash, created_at)
   VALUES ('00000000-0000-0000-0000-000000000001', 'jerome@viableview.us', 'placeholder-no-auth-yet', now());"

# Upload Kestra flow
curl -X POST http://localhost:8080/api/v1/flows/import \
  -F fileUpload=@kestra/flows/run-scraper.yml

# Verify
bash scripts/smoke-test.sh
```

### Updating after a code change

```bash
# Backend or dashboard update
docker compose pull && docker compose up -d

# Pipeline (us-z-3) update — automatic on next job via pullPolicy: ALWAYS
# (Kestra pulls the latest image when it starts a new execution)
```

---

## Running a job

1. Open `http://<vps-ip>` in a browser
2. Click **Run scraper**
3. Upload a `.jsonl` or `.csv` file (max 100 MB)
4. Toggle **Enable proxy** off for the demo (SMTP relay not configured)
5. Click **Submit** — job appears as `QUEUED`
6. Status auto-refreshes every 10 seconds
7. Click the job row to stream live logs
8. Once `COMPLETED`, click **Download** for the output CSV

> Concurrency is set to 1 on KVM-2GB. Only one pipeline job runs at a time; additional submissions queue automatically.

---

## GHCR packages

All three images are public and require no authentication to pull:

| Image | Built from |
|-------|-----------|
| `ghcr.io/vvjerome/us-z-backend:latest` | `us-z-dashboard` — `backend/` |
| `ghcr.io/vvjerome/us-z-dashboard-app:latest` | `us-z-dashboard` — `dashboard/` |
| `ghcr.io/vvjerome/us-z-3:latest` | `us-z-3` repo (also mirrored from `us-z-dashboard`) |

---

## Key references

| Resource | Path |
|----------|------|
| Architecture decisions (ADRs) | [.claude/directions/](.claude/directions/) |
| Project rules | [.claude/rules/](.claude/rules/) |
| Deployment edge cases | [DEPLOYMENT.md](DEPLOYMENT.md) |
| Slash commands | [.claude/commands/](.claude/commands/) |
