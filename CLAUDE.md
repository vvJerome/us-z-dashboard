# us-z-dashboard

Universal scraper platform: React dashboard + FastAPI backend + PostgreSQL + Kestra orchestrator + Docker pipeline containers on a single Racknerd KVM-2GB VPS.

---

## Quick orientation

| Layer | Location | Agent |
|-------|----------|-------|
| React SPA | `dashboard/` | FrontendDev |
| FastAPI backend | `backend/` | BackendDev |
| Scraper pipeline | `us-z-3/` (separate repo) | PipelineDev |
| Infra (Compose, Kestra, nginx, CI) | root config files | InfraSetup |

## Key decisions

See `.claude/directions/` for full ADRs:

- **ADR-001** — Kestra for job orchestration (concurrency limit **1** on KVM-2GB, retry, cancel API)
- **ADR-002** — 10-second HTTP polling, no WebSocket
- **ADR-003** — Single VPS + Docker Compose, no Kubernetes
- **ADR-004** — Isolated Docker container per job
- **ADR-005** — GitHub Actions + GHCR for pipeline CI/CD
- **ADR-006** — Local filesystem storage first (`/data` volume), S3 migration deferred

## Critical runtime notes

**Alembic migrations** — must run from `/srv/backend` with `PYTHONPATH=/srv`:
```bash
docker compose exec backend sh -c "cd /srv/backend && PYTHONPATH=/srv alembic upgrade head"
```

**First user insert** — backend uses a fixed placeholder UUID until auth is implemented:
```sql
INSERT INTO users (id, email, password_hash, created_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'your@email.com', 'placeholder-no-auth-yet', now());
```

**Kestra flow upload** — use the API directly (not the UI):
```bash
curl -X POST http://localhost:8080/api/v1/flows/import -F fileUpload=@kestra/flows/run-scraper.yml
```

See `DEPLOYMENT.md` for all known deployment gotchas.

## Deferred (do not implement yet)

- JWT authentication — add `# TODO: add auth` on routes that will need it
- S3 / object storage — use local `/data` volume (ADR-006)
- WebSocket / SSE — polling only (ADR-002)

## Commands

| Command | Purpose |
|---------|---------|
| `/start-feature` | Create a branch + identify the right agent |
| `/deploy-check` | Pre-deploy checklist (env vars, migrations, Kestra, volumes) |
| `/db-migration` | Generate + review + apply an Alembic migration |
| `/security-audit` | Audit changed files for CRITICAL / HIGH / MEDIUM issues |

## Rules and standards

See `.claude/rules/` for project-specific constraints:

- `project-stack.md` — hard technology choices (FastAPI, SQLAlchemy, TanStack Query, Tailwind, Kestra only)
- `security.md` — secrets handling, path sanitization, Docker security
- `testing.md` — coverage targets and what to test per component
- `coding-standards.md` — naming conventions, file structure, ruff/prettier

**Three non-negotiable rules (apply to all agents and Claude directly):**

| Rule | Detail |
|------|--------|
| 600 LOC limit | `.py` and `.ts`/`.tsx` files must not exceed 600 total lines. Split before continuing. Post-tool hook warns when exceeded. |
| Modularization + DRY | One responsibility per file. Extract shared logic on first duplication — never later. |
| No assumptions | When requirements or intent are unclear, ask a specific question. Never infer unstated product decisions. |

## Hooks (automatic)

- **PreToolUse (Bash)**: blocks `rm -rf` outside `/tmp`, force push to main, `docker system prune`, `DROP TABLE`, `alembic downgrade`, committing `.env`
- **PostToolUse (Write/Edit)**: auto-formats with ruff (Python) or prettier (TS/JSON); runs component test suite
- **PostToolUse (all)**: appends to `.claude/audit.log`
