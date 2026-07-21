# Testing Requirements

Three levels of testing for us-z-dashboard. Each level has a distinct purpose and is invoked differently.

---

## Testing protocol

### Unit tests — `make test-unit`

**When**: on every file save (post-tool hook), before every commit.  
**Speed**: < 10 seconds total.  
**Rule**: nothing real. All external dependencies (the worker VPS over SSH, object storage, network) are mocked.

| Component | Framework | Command |
|-----------|-----------|---------|
| Backend | pytest + pytest-asyncio + pytest-httpx | `make test-backend` |
| Dashboard | vitest + React Testing Library | `make test-dashboard` |
| Pipeline adapter | pytest | `make test-pipeline` |

**Backend unit tests** (`backend/tests/` — exclude `feature/`):
- All 6 route handlers: happy path + error cases (400, 404, 409, 413, 422)
- Worker status mapping: sentinel tokens (DONE / FAILED:n / RUNNING / GONE) → our status enum (parametrized)
- File path sanitization: `..` rejected with 400
- `services/worker.py`: trigger, status fetch, cancel — asyncssh mocked
- `services/job_queue.py`: promote oldest QUEUED, no-op when one RUNNING, dispatch-failure marks FAILED
- `services/storage.py`: save upload, log tail, output exists, path traversal rejection
- Alembic migrations: `test_migrations.py` verifies schema roundtrip

**Dashboard unit tests** (`dashboard/src/**/*.test.{ts,tsx}`):
- `StatusBadge`: correct color per status value
- `JobList`: concurrency guard (5/5 disables button), empty state
- `NewJobModal`: extension validation, size validation, toggle state
- `LogViewer`: renders lines, auto-scrolls, stops polling when COMPLETED
- `JobRow`: cancel/download button visibility per status, log viewer expand
- `DownloadButton`: loading state, error state, anchor click triggered
- `useJobs`: polling interval, data shape
- `useJobDownload`: loading/error/success state machine

**Pipeline unit tests** (`us-z-3/tests/test_entrypoint.py`):
- Env var validation: missing JOB_ID/INPUT_FILE_KEY, path traversal, invalid JSON
- `_prepare_v2_input`: composite ID format, blank line skipping, malformed JSON skipping
- `enable_proxy=false` sets `RACKNERD_ENABLED=false` before orchestrator imports

---

### Feature tests — `make test-feature`

**When**: before opening a PR, after touching a route handler or storage layer.  
**Speed**: < 30 seconds (real DB, real filesystem, worker SSH still mocked).  
**Rule**: no mocking of storage or database. The worker VPS (SSH/tmux) is the only external dependency that is mocked.

Location: `backend/tests/feature/`  
Mark: `@pytest.mark.feature`

**What feature tests cover:**
- Full `POST /jobs` → file written to disk → job in DB → status synced → `GET /jobs/{id}/file` streams CSV
- Download endpoint returns 409 while QUEUED/RUNNING, available once pipeline writes output
- Log endpoint reads real files written by the simulated pipeline
- Server-side 100 MB file size rejection (client validation is a UX guard only)

**What feature tests do NOT cover:**
- Worker-side pipeline internals (SSH/tmux still mocked)
- Real concurrent execution on the worker (the box runs one job at a time)
- Browser behaviour (that is smoke or E2E)

---

### Smoke tests — `make test-smoke`

**When**: after every deploy to the VPS. Never run against local dev.  
**Speed**: < 5 seconds.  
**Rule**: no mocking. All services must be running (`docker-compose up -d`).

Script: `scripts/smoke-test.sh`

**Checks**:
1. PostgreSQL accepting connections (`pg_isready`)
2. FastAPI `/health` endpoint returns `{"status": "ok"}`
3. Worker VPS reachable over SSH with `tmux`, `sqlite3`, and a writable data dir
4. `data_volume` Docker volume exists
5. nginx routing — `/health` reachable on port 80

**Failure**: any FAIL means do not proceed. Roll back the deploy or investigate before continuing.

---

## Coverage targets

| Component | Target | Measured on |
|-----------|--------|-------------|
| Backend route handlers | 80% | `backend/routers/` |
| Backend service layer | 80% | `backend/services/` |
| Dashboard components | all exported components have tests | `src/components/` |
| Pipeline adapter | all public functions | `entrypoint.py` |

---

## What NOT to test (anywhere)

- SQLAlchemy internals or connection pooling
- Pydantic field validation (framework-level)
- TanStack Query retry/caching behaviour
- React Router navigation internals
- Tailwind class names
- Docker Compose service wiring or nginx config (verify with `/deploy-check` instead)
- Proxy rotation (requires live proxies — mock at the boundary)
- The pipeline's own internals on worker-v3 (tested in the universal-scraper-v3 repo)

---

## CI requirements

All unit tests must pass on `main` at all times.  
Feature tests must pass before a PR is merged.  
Smoke tests run automatically after each VPS deploy via the `/deploy-check` command.

The post-tool hook runs the relevant unit test suite after each file edit — treat failures as blockers before staging any commit.
