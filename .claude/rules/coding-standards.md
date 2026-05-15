# Coding Standards

Language-specific conventions for the us-z-dashboard project.

## Virtual environment discipline

- **Never install Python packages globally.** All packages must be installed inside a component's own `.venv/`.
- Each component owns its venv: `backend/.venv/`, `pipeline/.venv/` (us-z-3 owns its own). Never share venvs across components.
- Always activate or invoke the component's venv explicitly: `backend/.venv/bin/pip install ...`, not `pip install ...`.
- If a global package is accidentally installed, remove it before proceeding: `pip uninstall <package>`.
- Never run `pip install` without first verifying the command targets a `.venv/bin/pip`.

## File size limit

- **Maximum 600 lines per file** — applies to `.py` and `.ts`/`.tsx` source files (total line count including blank lines and comments).
- When a file approaches 600 lines, split it into focused modules before continuing. Do not defer the split.
- The post-tool hook will emit a warning when an edited file exceeds 600 lines. Treat that warning as a required action, not an advisory.

Splitting strategy:
- Python: extract into a new module in the same package; import from it explicitly — no `__init__.py` re-exports that obscure where things live.
- TypeScript: extract into a sibling file in the same directory; use named imports — no barrel `index.ts` re-exports.

## Modularization and DRY

- **Each file has one clear responsibility.** If you cannot describe what a file does in one sentence without using "and", it needs to be split.
- **No duplicated logic across files.** If the same logic appears in two places, extract it to a shared module (`utils/`, `shared/`, or a named helper file) on the first duplication — do not wait for a third occurrence.
- **Do not abstract prematurely.** A shared utility is only justified when the same logic is used in 2+ places. One usage = keep it inline.
- Python shared utilities: `backend/utils/` or `pipeline/utils/`; TypeScript shared utilities: `dashboard/src/utils/` or `dashboard/src/lib/`

## No assumptions

- **Ask before assuming.** When requirements, scope, or intent are unclear, ask a specific question rather than making a reasonable guess and proceeding.
- One focused question is better than five vague ones. Identify the single most blocking ambiguity and ask about that first.
- This applies to all agents and to Claude directly. No agent should infer a requirement that was not stated.
- Exception: technical implementation details within the established stack (e.g., which SQLAlchemy function to use for a query) do not require confirmation — only product/requirement decisions do.

## Python (backend + pipeline)

- **Formatter/linter**: ruff. Run `ruff format <file>` then `ruff check --fix <file>`. Do not use black, flake8, or isort separately.
- **Type hints**: required on every function signature — all parameters and the return type. No unannotated functions.
- **No `Any`**: use `Any` only when genuinely unavoidable; always add an inline comment explaining why (e.g., `# Any: third-party lib returns untyped dict`).
- **No bare `except:`**: always catch specific exception types. `except Exception` is acceptable only at the top-level main() handler.
- **No docstrings by default**: write a docstring only when the function's behavior or invariants are genuinely non-obvious from the name and type signature alone.
- **Import order**: stdlib → third-party → local (ruff enforces this automatically).

## TypeScript (dashboard)

- **Strict mode**: `"strict": true` in `tsconfig.json` — non-negotiable.
- **No `any`**: use `unknown` and narrow with type guards or Zod schemas. If a third-party type is untyped, use `@ts-expect-error` with a comment — not `any`.
- **Interfaces for object shapes**: use `interface Job { ... }` for data structures; use `type` for unions, mapped types, and primitives.
- **No barrel exports**: do not create `index.ts` files that re-export everything from a directory. Import from the source file directly to avoid circular dependency risk and improve tree-shaking.

## React (dashboard)

- **Functional components only**: no class components, no HOCs.
- **Custom hooks for all async/polling logic**: `useJobs`, `useJobLogs`, `useJobDownload` live in `dashboard/src/hooks/`. No raw `useEffect` + `fetch` in component files.
- **Explicit props interfaces**: every component has a named `interface {ComponentName}Props { ... }`. No implicit `{}` or `React.FC` without explicit props.
- **No inline event handlers for complex logic**: extract named functions from JSX; keep JSX declarative.
- **No inline styles**: Tailwind utility classes only. If a class combination is used in 3+ components, extract it to a shared component — not a CSS file.

## FastAPI (backend)

- **Async handlers**: every route handler must be `async def`. No synchronous route handlers — SQLAlchemy async sessions require this.
- **Router files per resource**: `routers/jobs.py`, `routers/auth.py` — each creates an `APIRouter` and registers it in `main.py`.
- **Pydantic v2 schemas**: separate `{Resource}Create` and `{Resource}Response` schemas per endpoint. Never return a raw `dict`.
- **Dependency injection**: use `Depends()` for database sessions, current user (when auth is added), and Kestra client.

## Naming conventions

| Context | Convention | Example |
|---------|-----------|---------|
| Python variables / functions | snake_case | `job_id`, `get_jobs()` |
| Python classes | PascalCase | `JobCreate`, `JobResponse`, `KestraClient` |
| SQL column names | snake_case | `created_at`, `input_file_key` |
| TypeScript variables / functions | camelCase | `jobId`, `getJobs()` |
| TypeScript interfaces / types | PascalCase | `Job`, `JobStatus`, `ApiError` |
| JSON API field names | snake_case | `{ "job_id": "...", "created_at": "..." }` |
| React component names | PascalCase | `JobList`, `LogViewer`, `StatusBadge` |
| React custom hooks | camelCase with `use` prefix | `useJobs`, `useJobLogs` |
| Environment variables | SCREAMING_SNAKE_CASE | `DATABASE_URL`, `KESTRA_BASE_URL` |

## File structure conventions

```
backend/
├── main.py             — FastAPI app factory, router registration, lifespan
├── database.py         — SQLAlchemy async engine + get_db session dependency
├── models.py           — SQLAlchemy ORM models (User, Job)
├── schemas/            — Pydantic v2 request/response schemas per resource
├── routers/            — APIRouter files per resource (jobs.py, auth.py)
├── services/           — business logic: kestra.py, storage.py
└── alembic/            — versioned migrations

dashboard/src/
├── api/                — typed fetch wrapper functions (jobs.ts)
├── hooks/              — custom React hooks (useJobs.ts, useJobLogs.ts)
├── components/         — reusable UI components (JobRow, StatusBadge, LogViewer)
├── pages/              — page-level components (Dashboard.tsx)
└── types/              — shared TypeScript type definitions (job.ts)

pipeline/
├── main.py             — entrypoint: env parsing, orchestration
├── processor.py        — core record processing
├── storage.py          — file I/O abstraction
├── config.py           — CONFIG env var → typed Config dataclass
├── deduplicator.py     — duplicate detection
├── proxy.py            — proxy rotation (conditional import)
├── checkpoint.py       — checkpoint read/write
├── heartbeat.py        — heartbeat write
└── tests/              — pytest tests + fixtures/
```
