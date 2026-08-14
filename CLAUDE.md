# us-z-dashboard

Universal scraper platform: React dashboard + FastAPI backend + PostgreSQL on a single Hetzner VPS. The backend triggers the `universal-scraper-v3` pipeline on a dedicated worker VPS (worker-v3) over SSH + tmux — see [ADR-007](.claude/directions/adr-007-ssh-tmux-worker.md). (Kestra orchestration, ADR-001, is superseded.)

Full architecture: [docs/context.md](docs/context.md)

---

## Quick orientation

| Layer | Location | Agent |
|-------|----------|-------|
| React SPA | `dashboard/` | FrontendDev |
| FastAPI backend | `backend/` | BackendDev |
| Scraper pipeline | `pipeline/` | PipelineDev |
| Infra (Compose, Kestra, nginx, CI) | root config files | InfraSetup |

## Key decisions

See `.claude/directions/` for full ADRs:

- **ADR-001** — Kestra for job orchestration (**superseded by ADR-007**)
- **ADR-007** — SSH + tmux trigger of universal-scraper-v3 on worker-v3; backend FIFO queue (concurrency clause superseded by ADR-008)
- **ADR-008** — Per-VPS concurrency: one RUNNING job per worker VPS, each with its own independent SMTP fleet; `repo_dir` is now per-VPS
- **ADR-002** — 10-second HTTP polling, no WebSocket
- **ADR-003** — Single Hetzner VPS + Docker Compose, no Kubernetes
- **ADR-004** — Isolated Docker container per job
- **ADR-005** — GitHub Actions + GHCR for pipeline CI/CD
- **ADR-006** — Local filesystem storage first (`/data` volume), S3 migration deferred

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