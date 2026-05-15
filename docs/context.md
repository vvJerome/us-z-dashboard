# Universal scraper — technical architecture

## Overview

This document describes the full architecture for a containerized data processing platform that allows a small team (2–5 people) to upload JSONL or CSV files, configure and trigger isolated scraper jobs from a web dashboard, run up to 5 concurrent long-running jobs (hours to days), and download results when complete.

---

## System boundaries

| Concern | Decision |
|---|---|
| Hosting | Hetzner VPS (single server) |
| Concurrent jobs | Up to 5 simultaneously |
| Job duration | Hours to days |
| Users | 2–5 team members, login required |
| Job input | JSONL/CSV file upload + config toggles |
| Job output | Processed file, downloadable from dashboard |
| Orchestration | Kestra (self-hosted on the same VPS) |
| Pipeline runtime | Isolated Docker containers |
| Image source | GitHub Container Registry (built by GitHub Actions) |

---

## High-level architecture

```
Browser (team member)
    │
    │  HTTPS
    ▼
React dashboard          — upload file, set toggles, trigger job, poll status, download output
    │
    │  REST
    ▼
FastAPI backend          — auth, file handling, job registration, Kestra trigger, status proxy
    │                │
    │                └──► PostgreSQL  — users, jobs, job metadata, status
    │
    │  REST (POST /api/v1/executions)
    ▼
Kestra                   — queue, concurrency limit (max 5), retry, execution log
    │
    │  docker run
    ▼
Docker container         — isolated per job, runs the scraper pipeline
    │
    │  writes output
    ▼
Hetzner Object Storage   — input files, output files, per-job logs
```

---

## Component breakdown

### 1. React dashboard

Responsibilities:
- JWT-based login screen
- File upload (JSONL or CSV) with client-side size/type validation
- Config toggles per job (enable proxy, skip duplicates, etc.)
- "Run scraper" button — disabled if 5 jobs already running
- Job list with live status polling (every 10 seconds)
- Log viewer per job (tail of container stdout)
- Download button for output file once job is `COMPLETED`

No WebSocket. Simple polling is sufficient for jobs that run over hours or days — the latency difference is irrelevant.

---

### 2. FastAPI backend

Responsibilities:
- Issues and validates JWT tokens (login endpoint)
- Receives file upload — streams directly to Hetzner Object Storage, never touches local disk
- Writes a `jobs` row to PostgreSQL with `status = QUEUED`
- Calls Kestra's REST API to trigger the workflow, passing `job_id` and the object storage path of the uploaded file
- Exposes polling endpoints the dashboard uses for status and logs
- Serves a pre-signed download URL from object storage when job is `COMPLETED`

The FastAPI backend never runs the scraper itself. It is a coordination layer only.

Key endpoints:

```
POST   /auth/login                     → returns JWT
POST   /jobs                           → upload file + config, registers job, triggers Kestra
GET    /jobs                           → list all jobs for current user
GET    /jobs/{job_id}                  → job detail + current status
GET    /jobs/{job_id}/logs             → tail of execution log
GET    /jobs/{job_id}/download         → pre-signed URL for output file
DELETE /jobs/{job_id}                  → cancel a running job (calls Kestra cancel API)
```

---

### 3. PostgreSQL

Stores persistent application state. Not used for pipeline processing state (that lives inside the container).

`users` table:
```
id            UUID        primary key
email         TEXT        unique
password_hash TEXT
created_at    TIMESTAMP
```

`jobs` table:
```
id               UUID        primary key
user_id          UUID        foreign key → users
status           TEXT        QUEUED | RUNNING | COMPLETED | FAILED | CANCELLED
input_file_key   TEXT        object storage key for the uploaded input
output_file_key  TEXT        object storage key for the result (null until complete)
config           JSONB       the toggle values submitted by the user
kestra_execution_id  TEXT    Kestra's own execution ID (for proxying logs/cancel)
created_at       TIMESTAMP
started_at       TIMESTAMP
finished_at      TIMESTAMP
error_message    TEXT        populated on FAILED
```

---

### 4. Kestra

Kestra runs as a Docker service on the same Hetzner VPS. It is the only component that has permission to start and stop pipeline containers.

What Kestra provides for this system:
- **Concurrency enforcement** — configured `limit: 5` means a 6th trigger is queued, not dropped or errored
- **Retry on container crash** — if the Docker container exits with a non-zero code, Kestra retries up to a configured limit before marking the execution failed
- **Execution history** — every run is logged with start time, end time, exit code, and stdout/stderr
- **Cancel API** — FastAPI can call Kestra to terminate a running execution cleanly

Kestra workflow definition (`kestra/flows/run-scraper.yml`):

```yaml
id: run-scraper
namespace: prod

inputs:
  - name: job_id
    type: STRING
  - name: input_file_key
    type: STRING
  - name: config
    type: JSON

tasks:
  - id: scrape
    type: io.kestra.plugin.docker.Run
    image: "ghcr.io/{{ env.GITHUB_ORG }}/scraper:{{ env.IMAGE_TAG }}"
    pullPolicy: ALWAYS
    env:
      JOB_ID: "{{ inputs.job_id }}"
      INPUT_FILE_KEY: "{{ inputs.input_file_key }}"
      CONFIG: "{{ inputs.config }}"
      S3_ENDPOINT: "{{ env.S3_ENDPOINT }}"
      S3_BUCKET: "{{ env.S3_BUCKET }}"
      S3_ACCESS_KEY: "{{ env.S3_ACCESS_KEY }}"
      S3_SECRET_KEY: "{{ env.S3_SECRET_KEY }}"
    containerResources:
      request:
        memory: "512Mi"
        cpu: "0.5"

concurrency:
  limit: 5
  behavior: QUEUE

errors:
  - id: notify-failure
    type: io.kestra.core.tasks.flows.Sequential
    tasks:
      - id: update-status
        type: io.kestra.plugin.scripts.python.Script
        # FastAPI webhook call to mark job as FAILED in PostgreSQL

triggers:
  - id: api
    type: io.kestra.core.models.triggers.types.Webhook
```

Kestra is triggered via its webhook trigger or REST API — FastAPI calls it as a standard HTTP POST after registering the job in PostgreSQL.

Status synchronisation: Kestra can call back to FastAPI (or FastAPI polls Kestra) to update job status in PostgreSQL. The simpler approach for this scale is FastAPI polling Kestra's execution API on each dashboard poll cycle, then writing the current status to PostgreSQL.

---

### 5. Docker container (the scraper pipeline)

Each job gets one container. Containers are fully isolated — separate filesystem, separate network namespace, separate process tree. A crash in one does not affect others.

The container:
1. Reads `JOB_ID`, `INPUT_FILE_KEY`, `CONFIG`, and S3 credentials from environment variables
2. Downloads the input file from object storage
3. Processes the file according to config (proxy enabled/disabled, duplicate skipping, etc.)
4. Writes output to object storage at `outputs/{JOB_ID}/result.jsonl` (or `.csv`)
5. Writes a log file to `logs/{JOB_ID}/run.log`
6. Exits with code `0` on success, non-zero on failure

The container has no database connection. It communicates with the outside world only through object storage. It does not call FastAPI or Kestra directly.

Internal structure of the pipeline repo:

```
pipeline/
├── main.py               — entrypoint, reads env vars, orchestrates the run
├── processor.py          — core processing logic
├── storage.py            — download input / upload output via S3 client
├── config.py             — parses CONFIG env var into a typed config object
├── deduplicator.py       — skip-duplicates logic
├── proxy.py              — proxy rotation logic (if enabled)
├── requirements.txt
└── Dockerfile
```

Dockerfile:

```dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "main.py"]
```

The image does not clone any repository at runtime. The code is baked into the image at build time.

---

### 6. Hetzner Object Storage

S3-compatible. Used for all file persistence. FastAPI and pipeline containers both access it; PostgreSQL stores only the object keys (paths), not the files themselves.

Storage layout:

```
bucket/
├── inputs/
│   └── {job_id}/input.jsonl        — uploaded by FastAPI at job creation
├── outputs/
│   └── {job_id}/result.jsonl       — written by container on completion
└── logs/
    └── {job_id}/run.log            — written by container during execution
```

Access:
- FastAPI: uploads input file, generates pre-signed download URL for output
- Pipeline container: downloads input, uploads output and log
- Dashboard: never accesses object storage directly — goes through FastAPI

---

### 7. GitHub Actions (CI/CD)

The pipeline code lives in a GitHub repository. On every push to `main`, GitHub Actions builds a Docker image and pushes it to GitHub Container Registry.

`.github/workflows/build.yml`:

```yaml
name: Build and push pipeline image

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      packages: write
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: ./pipeline
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/scraper:latest
            ghcr.io/${{ github.repository_owner }}/scraper:${{ github.sha }}
```

Kestra's workflow uses `pullPolicy: ALWAYS`, so when a new image is pushed, the next triggered job automatically pulls the updated image. No manual deployment step is needed for pipeline code changes.

Deploying backend or dashboard changes still requires an SSH step or a separate deployment workflow (not covered here — depends on your VPS setup).

---

## Authentication

JWT-based. FastAPI issues tokens on login. All dashboard API calls include the token in the `Authorization: Bearer` header.

- Tokens expire after 8 hours (configurable)
- No refresh tokens to start — users re-login when expired
- Passwords stored as bcrypt hashes in PostgreSQL
- No role-based access control initially — all authenticated users have the same permissions

User management: no self-registration. Accounts are created directly in the database by a team admin (a small CLI script or a protected admin endpoint is sufficient).

---

## Concurrency and queueing

Kestra enforces the concurrency limit. The dashboard should also reflect this visually — if 5 jobs are `RUNNING`, the "Run scraper" button is disabled with a "5/5 slots in use" message. This is a UX guard only; Kestra is the authoritative enforcer.

Behaviour when all 5 slots are full:
- New triggers are queued by Kestra (`behavior: QUEUE`)
- They appear in the dashboard as `QUEUED`
- They start automatically when a slot frees up

There is no maximum queue depth configured initially — all submitted jobs will eventually run.

---

## Long-running job considerations

Because jobs can run for hours or days:

**Checkpointing** — the pipeline container should write progress checkpoints to object storage periodically (e.g., every 1,000 records processed, write a `checkpoint.json` with the last processed record index). On Kestra retry after a crash, the container reads the checkpoint and resumes from that position rather than starting over. This requires the pipeline code to implement checkpoint-aware resumption logic.

**Log streaming** — the container writes logs to `logs/{job_id}/run.log` in object storage. The dashboard's log viewer fetches this file via FastAPI on each poll. For jobs running over days, this file can grow large — the log viewer should fetch only the last N lines (FastAPI reads the tail using an S3 range request or by downloading and slicing).

**Heartbeat** — if needed, the container can write a `heartbeat.json` file to object storage every few minutes with the current timestamp and progress count. FastAPI can surface this in the dashboard as "last seen active: 4 minutes ago", which is useful for detecting silently hung containers without relying on Kestra's timeout alone.

**Container timeout** — Kestra should be configured with a `timeout` on the task (e.g., `PT72H` for 72 hours) as a hard upper bound, so a hung container doesn't hold a concurrency slot indefinitely.

---

## Environment variables and secrets

All secrets are injected as environment variables. On the VPS, these are stored in a `.env` file loaded by Docker Compose. They are never committed to the repository.

Required secrets:

```
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/scraper

# JWT
JWT_SECRET_KEY=...
JWT_ALGORITHM=HS256
JWT_EXPIRY_HOURS=8

# Object storage
S3_ENDPOINT=https://your-bucket.hetzner-storage.com
S3_BUCKET=scraper-bucket
S3_ACCESS_KEY=...
S3_SECRET_KEY=...

# Kestra
KESTRA_BASE_URL=http://localhost:8080
KESTRA_API_KEY=...

# GitHub Container Registry (for Kestra to pull images)
GHCR_TOKEN=...
```

---

## VPS service layout

All services run via Docker Compose on the Hetzner VPS.

`docker-compose.yml` (abbreviated):

```yaml
services:
  postgres:
    image: postgres:16
    volumes:
      - postgres_data:/var/lib/postgresql/data
    env_file: .env

  kestra:
    image: kestra/kestra:latest
    depends_on: [postgres]
    volumes:
      - ./kestra/flows:/flows
      - /var/run/docker.sock:/var/run/docker.sock  # allows Kestra to start containers
    ports:
      - "8080:8080"
    env_file: .env

  backend:
    image: ghcr.io/yourorg/backend:latest
    depends_on: [postgres, kestra]
    ports:
      - "8000:8000"
    env_file: .env

  dashboard:
    image: ghcr.io/yourorg/dashboard:latest
    ports:
      - "3000:3000"

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/certs:/etc/nginx/certs

volumes:
  postgres_data:
```

NGINX terminates TLS and reverse-proxies:
- `/` → dashboard (port 3000)
- `/api/*` → backend (port 8000)
- `/kestra/*` → Kestra UI (port 8080) — restricted to internal access or VPN only

Note: Kestra needs access to the Docker socket (`/var/run/docker.sock`) so it can start pipeline containers on the host. This is standard for single-VPS setups.

---

## Deployment

### First-time setup

1. Provision Hetzner VPS (recommended: CPX31 or larger — 4 vCPU, 8 GB RAM, to accommodate up to 5 concurrent containers)
2. Install Docker and Docker Compose on the VPS
3. Clone the infrastructure repo onto the VPS
4. Create `.env` from the template, fill in all secrets
5. Create the Hetzner Object Storage bucket; note the endpoint and credentials
6. Run `docker compose up -d`
7. Apply database migrations (`alembic upgrade head` or equivalent)
8. Upload Kestra flow definition (`kestra/flows/run-scraper.yml`) via Kestra UI or API
9. Create team user accounts directly in PostgreSQL

### Updating the pipeline

Push to `main` in the pipeline repo → GitHub Actions builds and pushes a new image → next job triggered automatically pulls the new image. No VPS action required.

### Updating the backend or dashboard

Push to `main` in the respective repo → GitHub Actions builds and pushes → SSH into VPS, run `docker compose pull && docker compose up -d`. Or automate this with a deployment workflow step.

---

## What is explicitly out of scope

- Kubernetes — not needed for 5 concurrent jobs on a single VPS
- Autoscaling — fixed concurrency limit of 5 is sufficient; add more VPS capacity manually if needed
- Multi-region — single Hetzner region only
- Real-time log streaming (WebSocket) — polling every 10 seconds is sufficient given job durations
- Self-service user registration — accounts created manually by a team admin
- Output post-processing or delivery (email, webhook) — output is download-only from the dashboard