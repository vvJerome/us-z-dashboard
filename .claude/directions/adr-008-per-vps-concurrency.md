# ADR-008: Per-VPS concurrency, one RUNNING job per worker box

**Status**: Accepted
**Date**: 2026-08-11
**Supersedes**: the concurrency clause of [ADR-007](adr-007-ssh-tmux-worker.md) ("Concurrency is 1, enforced by the backend queue"). All other ADR-007 decisions (SSH+tmux trigger, exit-code sentinel, secrets handling) are unchanged.

## Context

ADR-007 enforced exactly one RUNNING job globally, because the only worker VPS (worker-v3) ran a single shared SMTP fleet — its own `start.sh` refused a second concurrent run for that reason.

A second Hetzner worker VPS, **state-dashboard-v4 (49.12.127.119)**, is being added to run `universal-scraper-v3` in parallel with worker-v3. It has its **own independent SMTP fleet**, so the single-shared-fleet constraint that motivated global concurrency=1 no longer applies once a job is scoped to a specific VPS.

Two gaps blocked genuine per-VPS parallelism:

1. `job_queue.py` gated promotion on "is any job RUNNING anywhere", not "is *this VPS* running a job".
2. Every `VpsInstance` implicitly shared one global `worker_repo_dir` setting, so a second box with a different `universal-scraper-v3` checkout path had nowhere to record it.

## Decision

- **Concurrency is now one RUNNING job per VPS**, not one globally. `job_queue.try_promote` computes the set of `vps_id`s with a RUNNING job and, for every other active `VpsInstance`, promotes that VPS's own oldest QUEUED job independently. `job_queue.sync_running_job` polls every RUNNING job (one per VPS), not just a single global one.
- **`VpsInstance.repo_dir`** is now a per-VPS column (migration `006_vps_repo_dir.py`), required (no default) on `POST /vps`. `WorkerClient` reads both `repo_dir` and `data_dir` from the `VpsInstance` it's given, instead of a global setting.
- Each worker VPS is expected to run its **own independent SMTP fleet** — registering a VPS without one re-introduces the cross-job interference ADR-007 was guarding against, so this is an operational precondition, not something the backend enforces.

## Consequences

- The dashboard's 5/5 concurrency guard remains a soft global UI cap; actual concurrency is now `(number of active VPS)` simultaneous RUNNING jobs, one per box.
- A job pinned to a specific `vps_id` (via `POST /jobs?vps_id=...`) only ever competes with other QUEUED jobs on that same VPS.
- Adding a third+ worker VPS requires no further queue changes — `POST /vps` with a distinct `repo_dir`/`data_dir`/SSH details is sufficient, provided that VPS has its own SMTP fleet.
- If a future worker VPS *doesn't* have an independent SMTP fleet (e.g., temporarily sharing one with another box), the backend has no way to know or prevent concurrent runs from colliding — that must be caught at registration time, not enforced in code.
