# ADR-004: Isolated Docker Container per Scraper Job

**Status**: Accepted  
**Date**: 2026-05-14

## Context

Each scraper job needs a separate execution environment. Requirements:

- A crash, OOM kill, or infinite loop in one job must not affect other running jobs
- Each job gets its own filesystem, process tree, and network namespace
- Pipeline code must be versioned and reproducible — the same image tag must produce the same behavior
- Jobs run for hours or days — container startup overhead must be negligible relative to job duration

## Decision

Each job runs as its own **Docker container** launched by Kestra using `io.kestra.plugin.docker.Run`.

Key configuration:

- **Image**: `ghcr.io/{org}/scraper:{tag}` — code is baked into the image at build time, not cloned at runtime
- **Pull policy**: `ALWAYS` — Kestra pulls the latest image on every job trigger; pipeline code changes deploy automatically without VPS SSH
- **Resource limits**: `memory: 512Mi`, `cpu: 0.5` per container (configurable per job if needed)
- **Task timeout**: `PT72H` — hard upper bound; prevents a hung container from holding a concurrency slot indefinitely
- **Exit code semantics**: `0` = success; non-zero = failure (Kestra retries on non-zero up to configured limit, then marks FAILED)
- **Isolation**: separate cgroup, network namespace, and PID namespace — kernel-level isolation between jobs

## Consequences

- A bug, OOM, or crash in one container cannot affect others — each has its own process tree and cgroup limits
- Pipeline code changes deploy automatically: push to `main` → GitHub Actions builds image → next triggered job pulls new image (no SSH step needed for pipeline updates)
- Container startup time (~1–2 seconds) is irrelevant for jobs measured in hours or days
- Memory allocation: 512 Mi × 5 concurrent = 2.5 GB reserved for jobs; CPX31 (8 GB RAM) has adequate headroom for platform services plus all 5 job containers
- Containers cannot be inspected after they exit — all output, logs, checkpoints, and heartbeats must be written to the shared data volume before the container exits
- Debugging a crashed job requires reading the log file from the data volume, not `docker logs` (container is gone by the time the failure is noticed)
