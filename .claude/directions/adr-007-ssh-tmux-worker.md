# ADR-007: Trigger the pipeline directly on worker-v3 via SSH + tmux

**Status**: Accepted  
**Date**: 2026-07-16  
**Supersedes**: [ADR-001](adr-001-kestra-orchestration.md) (Kestra orchestration) and the job-execution portion of [ADR-004](adr-004-docker-job-isolation.md) (per-job Docker containers).

## Context

The pipeline (`universal-scraper-v3`, internally us-z-3) is now deployed and operated on a dedicated Hetzner VPS, **worker-v3 (95.217.63.54)**, where runs are started by launching `python -m orchestrator` / `entrypoint.py` in a tmux session. That box runs **no Kestra and no job-submission API**, and it deliberately runs **one pipeline at a time** (its own `start.sh` refuses a second concurrent session — the SMTP fleet and cost model assume a single active run).

The old design (ADR-001) had the dashboard call a Kestra executions API on each VPS, and Kestra launched a per-job Docker container via the host Docker socket (ADR-004). Keeping Kestra would mean standing up and maintaining a Kestra instance plus a container image on worker-v3, duplicating an orchestrator the operators no longer use.

## Decision

The FastAPI backend triggers pipeline runs **directly over SSH**, launching `entrypoint.py` in a **tmux** session on worker-v3. Kestra is removed entirely.

- **Trigger** (`services/worker.py` → `WorkerClient.trigger`): SFTP the input file and a per-job `job.env` (chmod 600) to `{data_dir}/jobs/{job_id}/`, then `tmux new-session -d -s job-{job_id}` running `entrypoint.py` in the pipeline venv. `entrypoint.py` is reused unchanged — it already reads `JOB_ID`/`INPUT_FILE_KEY`/`CONFIG`/`DATA_DIR` and writes the exact layout the dashboard reads (`outputs/{id}/result.csv`, `logs/{id}/run.log`, `jobs/{id}/v2/pipeline.db`).
- **Completion detection — exit-code sentinel**: the tmux command appends `echo $? > {job_dir}/exit_code`. Status resolves in one SSH round trip: `exit_code==0` + `result.csv` present → COMPLETED; `exit_code` non-zero (or 0 without CSV) → FAILED; no sentinel but tmux session alive → RUNNING; neither → FAILED ("session disappeared").
- **Single-run queue** (`services/job_queue.py`): submissions stay `QUEUED`. An in-process asyncio loop started in the FastAPI lifespan (interval 20s) syncs the RUNNING job and, when the worker is idle, promotes the oldest QUEUED job. Poll-on-read (list/get endpoints) runs the same sync + promote so an open dashboard advances the queue faster. An `asyncio.Lock`, a DB "already RUNNING" check, and a defensive remote `tmux ls | grep ^job-` guard prevent double-dispatch (single uvicorn worker).
- **Secrets**: baseline pipeline secrets (SERPER, ZUHAL, Cherry, Racknerd, BBOPS) live in worker-v3's own `.env`, sourced by the tmux command. Only per-job API-key overrides are written to `job.env`. No secret ever appears on the command line.

## Consequences

- **No auto-retry.** Unlike Kestra, a crashed or rebooted run is detected as FAILED and the queue advances; the operator resubmits. Acceptable for a single-operator tool; revisit if unattended reliability matters.
- **Concurrency is 1, enforced by the backend queue** (not 5 via Kestra). The dashboard's 5/5 guard is now a soft UI cap only.
- **worker-v3 must have** `tmux`, `sqlite3` (metrics read the pipeline DB over SSH), a writable `DATA_DIR` (`/home/devonly/data`), and the pipeline venv + `.env` with valid secrets and an SMTP fleet (Cherry provisioning or inventory) — otherwise the pipeline fails downstream even though the trigger succeeds.
- **SSH host keys are not pinned** (`known_hosts=None`) — pre-existing across `ssh.py`/`pipeline_ssh.py`, carried into `worker.py`.
- If the execution target changes again, `services/worker.py` + `services/job_queue.py` are the only components that change. `services/ssh.py`, `services/pipeline_ssh.py` (live metrics), and `services/storage.py` were already orchestrator-independent.
