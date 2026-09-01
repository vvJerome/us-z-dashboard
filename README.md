# us-z-dashboard

**Enrichment Engine** — a platform for running long-running JSONL/CSV enrichment jobs from a shared web dashboard.

Full architecture: [docs/context.md](docs/context.md)

---

## Architecture

| Layer        | Technology                                 |
|--------------|--------------------------------------------|
| Dashboard    | React 18 + Vite + TanStack Query + Tailwind |
| Backend      | FastAPI + SQLAlchemy 2.x + Alembic         |
| Execution    | `universal-scraper-v3` on worker-v3, triggered over SSH + tmux; backend FIFO queue (concurrency 1) — see [ADR-007](.claude/directions/adr-007-ssh-tmux-worker.md) |
| Pipeline     | Python 3.12 (venv on worker-v3)            |
| Storage      | PostgreSQL 16 + local `/data` volume       |
| Infra        | Docker Compose on Hetzner VPS              |

---

## Local development setup

**Prerequisites**: Docker, Docker Compose v2, `jq`

```bash
# 1. Clone the repo
git clone <repo-url> && cd us-z-dashboard

# 2. Create your local .env
cp .env.template .env
# Edit .env and fill in all required values

# 3. Start all services
docker compose up -d

# 4. Apply database migrations
docker compose exec backend alembic upgrade head

# 5. Ensure worker-v3 is reachable (SSH key loaded, tmux + sqlite3 installed,
#    universal-scraper-v3 checked out with a valid .env + SMTP fleet).
#    The backend seeds the worker-v3 VPS row and starts the job queue on boot.
```

**Access URLs:**

| Service      | URL                          |
|--------------|------------------------------|
| Dashboard    | http://localhost:3000        |
| Backend docs | http://localhost:8000/docs   |

---

## First-time VPS deployment

**Prerequisites**: Hetzner CPX31+ (4 vCPU, 8 GB RAM), Docker and Docker Compose v2 installed.

```bash
# 1. Clone the repo onto the VPS
git clone <repo-url> && cd us-z-dashboard

# 2. Create and populate .env
cp .env.template .env
# Fill in DATABASE_URL, JWT_SECRET_KEY, and the WORKER_* worker-v3 settings.
# Mount the worker SSH key at WORKER_SSH_KEY_PATH.

# 3. Start all services
docker compose up -d

# 4. Apply migrations
docker compose exec backend alembic upgrade head

# 5. Run the pre-deploy checklist (includes the worker-v3 reachability smoke test)
/deploy-check

# 6. TLS — place your certificates in nginx/certs/ and restart nginx
docker compose restart nginx
```

---

## Triggering and monitoring a job

1. Open the dashboard and click **Run enrichment**
2. Upload a `.jsonl` or `.csv` file (max 1 GB)
3. Set config toggles — **Enable proxy** and **Skip duplicates**
4. Click **Submit** — the job appears as `QUEUED`
5. Status updates automatically every 10 seconds
6. Click the job row to open the **log viewer**
7. Once status is `COMPLETED`, click **Download** to get the output file

> worker-v3 runs one job at a time. Additional submissions stay `QUEUED` and the backend starts the next one automatically when the current run finishes. (The "5/5 slots" UI cap is now a soft guard only.)

---

## Updating pipeline code

Push to `main` → GitHub Actions builds and pushes a new image to GHCR → the next triggered job pulls the new image automatically via `pullPolicy: ALWAYS`. No VPS action required.

Updating the backend or dashboard still requires a manual pull on the VPS:

```bash
docker compose pull && docker compose up -d
```

---

## Key references

| Resource | Path |
|----------|------|
| Full architecture | [docs/context.md](docs/context.md) |
| Architecture decisions (ADRs) | [.claude/directions/](.claude/directions/) |
| Project rules | [.claude/rules/](.claude/rules/) |
| Slash commands | [.claude/commands/](.claude/commands/) |
