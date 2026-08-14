# Session handoff: multi-vps-job-routing

Previous Claude Code session: `cb81717a-f9b1-4f27-9898-11d15edcaefe` (died at 100% context).

## What was built

Job metrics monitoring: backend SSH-reads pipeline SQLite on remote VPS, frontend Monitor page with charts.

**Backend (new/modified):**

- `backend/schemas/metrics.py` — Pydantic response model
- `backend/routers/metrics.py` — `GET /jobs/{id}/metrics`
- `backend/services/pipeline_ssh.py` — SSH + sqlite3 queries on VPS
- `backend/services/metrics_cache.py` — caching layer
- `backend/main.py` — registered metrics router
- `backend/routers/jobs.py` — clears cache when job finishes

**Frontend (new/modified):**

- `dashboard/src/types/metrics.ts`, `api/metrics.ts`, `hooks/useJobMetrics.ts`
- `dashboard/src/components/MetricsCharts.tsx` — throughput + timeline charts
- Monitor page at `/jobs/:jobId/monitor`, Live/Metrics buttons on JobRow

## Recent fixes

- Allow metrics for COMPLETED jobs (not just RUNNING)
- JobRow: "Live" for RUNNING, "Metrics" for COMPLETED
- Fixed sqlite3 PATH in `pipeline_ssh.py`: use `/usr/bin/sqlite3` (non-interactive SSH had wrong PATH)
- sqlite3 confirmed installed on VPS#1 at `/usr/bin/sqlite3`

## Verified state (2026-05-31)

```bash
curl -s http://localhost/api/jobs/6c943724-a0bd-4748-a51e-a08cfa1f8d8f/metrics
# Returns run_id: run_1780196723-producer, total: 5
```

## VPS context

This section originally pointed to a local Claude Code memory file on one
engineer's machine and listed the three VPS instances' real IP addresses.
Both have been redacted here since this is a public-facing repo — real
infrastructure endpoints should not be committed to version control. See
your team's internal infra notes for current VPS addresses and SSH keys.

- VPS#1: `<redacted>`, key `~/.ssh/id_vps1`
- VPS#2: `<redacted>`, key `~/.ssh/id_vps2`
- VPS#3: `<redacted>`, key `~/.ssh/id_vps3`

## Next steps

1. Test Monitor page in browser at http://localhost for RUNNING and COMPLETED jobs
2. Rebuild if code changes aren't live: `docker compose up -d --build backend dashboard`
3. Fix any remaining "pipeline not ready yet" UI issues if they persist

## Fresh Claude Code session

```bash
cd <path-to-local-checkout>
claude
```

Do **not** use `claude --resume` for the old session. Paste this file or reference `@docs/session-handoff-multi-vps.md`.
