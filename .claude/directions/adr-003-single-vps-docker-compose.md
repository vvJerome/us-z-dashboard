# ADR-003: Single Hetzner VPS with Docker Compose

**Status**: Accepted  
**Date**: 2026-05-14

## Context

The platform serves a team of 2–5 people running up to 5 concurrent scraper jobs. Deployment options evaluated:

1. **Single VPS + Docker Compose**: all services on one machine, managed with a single compose file
2. **Kubernetes**: container orchestration cluster (self-hosted or managed like GKE/EKS)
3. **Managed cloud services**: separate managed DB (RDS), managed queue (SQS), managed compute (ECS/Lambda)

The primary constraints are: low operational complexity, low cost, max 5 concurrent jobs, and team size of 2–5 with no dedicated DevOps.

## Decision

Deploy all services on a **single Hetzner VPS** (CPX31 or larger: 4 vCPU, 8 GB RAM, ~€20/month) using **Docker Compose**.

Services on the VPS:
- PostgreSQL 16 (persistent state)
- Kestra (job orchestrator)
- FastAPI backend
- React dashboard (nginx-served static build)
- nginx (TLS + reverse proxy)

## Consequences

- **Simplicity**: one `docker compose up -d` starts the entire platform — no cluster management, no Helm charts, no kubeconfig
- **Cost**: ~€20–30/month vs. hundreds of euros for managed Kubernetes or multi-service cloud
- **Capacity**: CPX31 (4 vCPU, 8 GB RAM) comfortably handles 5 concurrent pipeline containers (each capped at 512 Mi / 0.5 CPU) plus the platform services
- **Single point of failure**: VPS downtime = full platform downtime — acceptable for an internal team tool; not acceptable for customer-facing production workloads
- **No autoscaling**: fixed capacity. If concurrent job count needs to exceed ~10–15, the VPS needs more RAM/CPU or a second machine needs to be added — manual intervention required
- **Operator simplicity**: deploying backend or dashboard changes requires `docker compose pull && docker compose up -d` over SSH — straightforward but manual. Pipeline changes are zero-touch (GitHub Actions → GHCR → Kestra pulls on next job trigger)
- **Scaling ceiling**: if the team grows to 10+ or job concurrency needs to exceed ~15, revisit this decision and consider moving Kestra to a dedicated node or migrating to a managed orchestration service
