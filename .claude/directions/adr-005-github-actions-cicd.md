# ADR-005: GitHub Actions + GHCR for Pipeline CI/CD

**Status**: Accepted  
**Date**: 2026-05-14

## Context

Pipeline code changes (bug fixes, new processing logic) need to reach the Kestra executor without requiring manual SSH steps or VPS intervention. The team uses GitHub for source control and needs a zero-touch deploy path for the scraper image.

Backend and dashboard changes are less frequent and can tolerate a manual `docker compose pull` step for now.

## Decision

Use **GitHub Actions** to build and push Docker images to **GitHub Container Registry (GHCR)** on every push to `main`.

Workflow for each component (pipeline, backend, dashboard):
1. Push to `main` triggers the corresponding GitHub Actions workflow
2. Workflow builds the Dockerfile from the component directory (`./pipeline/`, `./backend/`, `./dashboard/`)
3. Pushes two image tags:
   - `ghcr.io/{org}/{image}:latest`
   - `ghcr.io/{org}/{image}:{git-sha}` (for rollback pinning)
4. For the pipeline image: Kestra's `pullPolicy: ALWAYS` means the next triggered job automatically pulls the new `latest` image — no VPS action required

Backend and dashboard deploys still require `docker compose pull && docker compose up -d` on the VPS (or a CD step to be added later).

Authentication: `docker/login-action@v3` using `GITHUB_TOKEN` — no separate registry credentials needed for GHCR in the same org.

## Consequences

- **Pipeline deploys are zero-touch**: merge PR → CI builds → next job triggered uses new code automatically
- **SHA tags enable rollback**: to run the previous pipeline version, pin `IMAGE_TAG` in the Kestra flow environment and re-trigger
- **GHCR is free** for packages in a GitHub org — no separate registry cost
- **Backend/dashboard deploys are still manual**: SSH into VPS + `docker compose pull` — acceptable for low-frequency backend changes; add a CD step (e.g., webhook + watchtower) when deploy frequency increases
- **Image build failures block new pipeline versions**: if CI fails, Kestra continues using the previous cached image — jobs still run, but on old code. This is safer than a broken deploy that crashes running jobs.
- **No staging environment**: changes go directly from `main` to the production VPS. For a 2–5 person internal tool this is acceptable; add a staging VPS when the team needs more confidence before production deploys
