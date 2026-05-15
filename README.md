# us-z-dashboard

Universal scraper platform for running long-running JSONL/CSV scraper jobs from a shared web dashboard.

Full architecture: [docs/context.md](docs/context.md)

---

## Architecture

| Layer        | Technology                                 |
|--------------|--------------------------------------------|
| Dashboard    | React 18 + Vite + TanStack Query + Tailwind |
| Backend      | FastAPI + SQLAlchemy 2.x + Alembic         |
| Orchestrator | Kestra (self-hosted, concurrency limit: 5) |
| Pipeline     | Docker container (Python 3.12)             |
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

# 5. Upload the Kestra flow
curl -X POST http://localhost:8080/api/v1/flows/import \
  -F fileUpload=@kestra/flows/run-scraper.yml
```

**Access URLs:**

| Service      | URL                          |
|--------------|------------------------------|
| Dashboard    | http://localhost:3000        |
| Backend docs | http://localhost:8000/docs   |
| Kestra UI    | http://localhost:8080        |

---

## First-time VPS deployment

**Prerequisites**: Hetzner CPX31+ (4 vCPU, 8 GB RAM), Docker and Docker Compose v2 installed.

```bash
# 1. Clone the repo onto the VPS
git clone <repo-url> && cd us-z-dashboard

# 2. Create and populate .env
cp .env.template .env
# Fill in DATABASE_URL, JWT_SECRET_KEY, KESTRA_BASE_URL, KESTRA_WEBHOOK_KEY

# 3. Start all services
docker compose up -d

# 4. Apply migrations
docker compose exec backend alembic upgrade head

# 5. Upload the Kestra flow
curl -X POST http://localhost:8080/api/v1/flows/import \
  -F fileUpload=@kestra/flows/run-scraper.yml

# 6. Run the pre-deploy checklist
/deploy-check

# 7. TLS — place your certificates in nginx/certs/ and restart nginx
docker compose restart nginx
```

---

## Triggering and monitoring a job

1. Open the dashboard and click **Run scraper**
2. Upload a `.jsonl` or `.csv` file (max 100 MB)
3. Set config toggles — **Enable proxy** and **Skip duplicates**
4. Click **Submit** — the job appears as `QUEUED`
5. Status updates automatically every 10 seconds
6. Click the job row to open the **log viewer**
7. Once status is `COMPLETED`, click **Download** to get the output file

> Up to 5 jobs run concurrently. The Submit button disables with "5/5 slots in use" when all slots are taken — new jobs are queued automatically by Kestra and start when a slot frees up.

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
