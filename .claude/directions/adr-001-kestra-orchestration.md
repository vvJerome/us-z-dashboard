# ADR-001: Use Kestra for Job Orchestration

**Status**: Superseded by [ADR-007](adr-007-ssh-tmux-worker.md) (2026-07-16)  
**Date**: 2026-05-14

## Context

The platform needs to run scraper jobs as isolated processes with a hard concurrency limit of 5. When all 5 slots are full, new submissions must be queued (not dropped or errored). Jobs must be retried automatically on container crash. We need a cancel API so users can stop running jobs from the dashboard.

Alternatives considered:

- **Celery + Redis**: Requires managing a Redis broker and Celery workers separately. Concurrency limiting requires custom semaphore logic. No built-in execution history UI or Docker-native task type.
- **RQ (Redis Queue)**: Similar to Celery. No native Docker container support. Queueing behavior requires manual implementation.
- **Custom cron/systemd**: No queueing, no retry, no history, no cancel API. Would require significant custom code to replicate what Kestra provides.

## Decision

Use **Kestra** (self-hosted on the same Hetzner VPS) as the sole job orchestrator.

Kestra provides out of the box:

- **Concurrency enforcement**: `concurrency.limit: 5` with `behavior: QUEUE` — the 6th trigger is queued automatically, not rejected
- **Retry on container crash**: configurable retry count; Kestra retries on non-zero exit code before marking FAILED
- **Execution history**: every run logged with start time, end time, exit code, and stdout/stderr — accessible via Kestra UI and REST API
- **Cancel API**: `DELETE /api/v1/executions/{id}/kill` — FastAPI calls this when the user cancels from the dashboard
- **Docker task type**: `io.kestra.plugin.docker.Run` — starts containers directly on the host via Docker socket, no separate container runtime needed

Kestra is triggered via its webhook trigger. FastAPI calls it as a standard HTTP POST after registering the job in PostgreSQL.

## Consequences

- Kestra must be running for any jobs to execute — it is a single point of failure for job dispatch (acceptable for a single-VPS, 2–5 person tool)
- Kestra requires access to `/var/run/docker.sock` on the host — standard and expected for single-VPS setups
- FastAPI must poll Kestra's execution API to sync job status to PostgreSQL on each dashboard poll cycle
- The Kestra flow definition (`kestra/flows/run-scraper.yml`) must be uploaded and active before any jobs can run
- Kestra UI (port 8080) must be restricted to internal access only — never exposed publicly
- If Kestra is replaced in future, the FastAPI ↔ Kestra integration layer (`services/kestra.py`) is the only component that changes
