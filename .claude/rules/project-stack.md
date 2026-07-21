# Project Stack Constraints

Hard technology constraints for us-z-dashboard. Do not introduce alternatives without a new ADR approved by the team.

## Languages and runtimes

- **Python 3.12** — backend and pipeline. No other Python versions.
- **TypeScript** with `"strict": true` — dashboard only. No plain `.js` source files.
- **Node.js** — dashboard build tooling only (Vite, vitest, prettier). Not a runtime process.

## Backend

- **FastAPI** — the only web framework. No Flask, Django, or Starlette standalone.
- **SQLAlchemy 2.x async** — the only ORM. No raw psycopg2 queries, no Tortoise ORM, no SQLModel.
- **Alembic** — all schema changes via versioned migrations. Never call `Base.metadata.create_all()` in production code.
- **Pydantic v2** — all request/response models. Never return a raw `dict` from an endpoint handler.
- **httpx** with `AsyncClient` — HTTP client for any outbound HTTP. Do not use `requests` in async code.
- **asyncssh** — SSH/SFTP to the worker VPS (trigger, file transfer, metrics). Do not shell out to the `ssh`/`scp` binaries from Python.
- **ruff** — linting and formatting. Do not introduce black, flake8, or isort separately.

## Frontend

- **React 18** — functional components only. No class components, no HOCs.
- **Vite** — bundler and dev server. No Create React App, no webpack configs, no Next.js (this is a SPA, not an SSR app).
- **TanStack Query v5** (`@tanstack/react-query`) — all server state, polling, and mutation handling. No SWR, no Redux for server state, no raw `useEffect` + `fetch` for data fetching.
- **React Router v6** — client-side routing. No other router.
- **Tailwind CSS** — all styling. No CSS-in-JS (styled-components, emotion), no CSS Modules, no component libraries (MUI, shadcn/ui, Chakra) without explicit team approval.

## Infrastructure

- **SSH + tmux to worker-v3** — the ONLY job execution path (see ADR-007). The backend triggers `universal-scraper-v3` over SSH and queues jobs in-process (concurrency 1). Do not add Kestra, Celery, RQ, APScheduler, Bull, or cron-based dispatch. ADR-001 (Kestra) is superseded.
- **Docker Compose v2** — no Kubernetes, no Docker Swarm, no Nomad. See ADR-003.
- **PostgreSQL 16** — the only database. No SQLite (even for tests — use a test PostgreSQL instance), no MySQL, no MongoDB.
- **nginx** — TLS termination and reverse proxy. No Caddy, no Traefik.

## File storage

- **Local filesystem (`/data` volume)** — per ADR-006. Do not introduce S3, MinIO, or any object storage client until ADR-006 is superseded.

## Deferred — do not implement until explicitly scoped

- **JWT authentication** — not wired yet. Mark all routes that will need protection with `# TODO: add auth`. Do not add login pages, token refresh logic, or auth middleware.
- **WebSocket / SSE** — not used. Polling only. See ADR-002.
- **Email / notification delivery** — out of scope. Output is download-only from the dashboard.
- **Self-service user registration** — out of scope. Accounts are created directly in the database.
