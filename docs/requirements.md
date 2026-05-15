# Resource Requirements

What is needed to deploy and operate the us-z scraper platform.

---

## Compute

| Resource | Spec | Purpose | Monthly cost |
|----------|------|---------|-------------|
| Hetzner VPS | CPX31 — 4 vCPU, 8 GB RAM, 160 GB SSD | Runs all services: postgres, kestra, backend, dashboard, nginx, and up to 5 concurrent pipeline containers | ~€22 |
| Racknerd VPS | Existing | SSH SOCKS5 tunnel for SMTP relay — already in use by us-z-3 | Already paid |

**Minimum spec rationale:** 5 pipeline containers × 512 MB each = 2.5 GB reserved. The remaining 5.5 GB covers platform services (postgres, kestra, backend, nginx). CPX31 fits this with headroom.

**Upgrade path:** If concurrent job count needs to exceed 10–12, upgrade to CPX41 (8 vCPU, 16 GB RAM, ~€40/month) or add a second VPS.

---

## Networking

| Resource | Purpose | Cost |
|----------|---------|------|
| Domain name | Clean URL for the dashboard (e.g., `scraper.viableview.us`) | ~$12–15/year |
| SSL certificate | HTTPS termination — Let's Encrypt via Certbot | Free |
| Static IP | Hetzner assigns one with the VPS | Included |

A domain is optional for internal use — the VPS IP address works fine for a small team.

---

## External services

| Service | What it does | Required | Notes |
|---------|-------------|----------|-------|
| Serper API | Google search enrichment for domain/email discovery | Yes | Pay-per-use, ~$50 per 50,000 searches |
| Zuhal API | Email validation fallback | Yes | Pay-per-use |
| bbops.io | Primary SMTP batch email verifier | Yes | Pay-per-use |
| Racknerd SMTP | SMTP relay via SSH tunnel | Yes (when `enable_proxy=true`) | Already contracted |

All API keys are stored only in `.env` on the VPS — never committed to the repository.

---

## GitHub

| Resource | Purpose | Cost |
|----------|---------|------|
| GitHub org | Hosts the repository and GitHub Container Registry (GHCR) | Free for public; $4/user/month for private |
| GHCR | Stores Docker images for backend, dashboard, and pipeline | Free up to 500 MB storage per month for private packages |
| GitHub Actions | CI/CD — builds and pushes Docker images on every push to `main` | Free up to 2,000 minutes/month |

---

## Secrets inventory

These must be set in `.env` on the VPS before the platform can start. Use `.env.template` as the base.

| Variable | Description | Where to get it |
|----------|-------------|----------------|
| `POSTGRES_PASSWORD` | Database password | Generate: `openssl rand -base64 32` |
| `DATABASE_URL` | Full postgres connection string | Derived from above |
| `JWT_SECRET_KEY` | Signing key for future auth tokens | Generate: `openssl rand -base64 32` |
| `KESTRA_WEBHOOK_KEY` | Shared secret for Kestra webhook trigger | Generate: `openssl rand -hex 20` |
| `GITHUB_ORG` | GitHub org name | Your GitHub org |
| `IMAGE_TAG` | Docker image tag to pull (`latest` or a specific SHA) | `latest` for production |
| `SERPER_API_KEY` | Serper.dev API key | serper.dev dashboard |
| `ZUHAL_API_KEY` | Zuhal API key | Zuhal provider dashboard |
| `RACKNERD_HOST` | Racknerd VPS hostname or IP | Racknerd control panel |
| `RACKNERD_SSH_USER` | SSH user for the SMTP tunnel | `egress` (us-z-3 convention) |
| `RACKNERD_SSH_KEY_PATH` | Path to SSH private key on the VPS | `/root/.ssh/racknerd_egress` |
| `BBOPS_BASE_URL` | bbops.io verifier endpoint | Default: `https://email-verifier.bbops.io` |

---

## One-time setup effort

| Task | Who | Estimated time |
|------|-----|----------------|
| Provision Hetzner VPS | DevOps / Jerome | 30 minutes |
| Configure DNS + SSL | DevOps / Jerome | 1 hour |
| Push repo to GitHub, set Actions secrets | Dev | 30 minutes |
| Trigger first CI build, verify GHCR images | Dev | 15 minutes |
| SSH to VPS, create `.env`, run `docker-compose up -d` | Dev | 30 minutes |
| Run `make migrate` against production DB | Dev | 5 minutes |
| Upload Kestra flow via API | Dev | 5 minutes |
| Create first user account directly in DB | Dev | 5 minutes |
| Smoke test: `make test-smoke` | Dev | 5 minutes |
| **Total** | | **~3.5 hours** |

---

## Ongoing operational load

| Task | Frequency | Effort |
|------|-----------|--------|
| Deploy backend/dashboard updates | Per PR merge | `docker compose pull && docker compose up -d` via SSH — ~5 minutes |
| Deploy pipeline (us-z-3) updates | Per PR merge | Automatic — GitHub Actions builds image, Kestra pulls on next job |
| Monitor disk usage (`/data` volume) | Weekly | Check `df -h` — pipeline outputs accumulate |
| Review Kestra execution history | As needed | Kestra UI at `http://<vps-ip>:8080` (internal only) |
| Rotate API keys | As needed | Update `.env`, `docker compose up -d` backend |

---

## Cost summary

| Item | Monthly | Annual |
|------|---------|--------|
| Hetzner CPX31 | €22 | €264 |
| Domain name | ~$1 | ~$13 |
| Serper API | Variable | ~$50–200 depending on run volume |
| Zuhal API | Variable | Based on usage |
| bbops.io | Variable | Based on usage |
| GitHub (private org) | $4/user | $48/user |
| **Fixed infrastructure** | **~€23/month** | **~€280/year** |

API costs scale with how many records are processed per month. For internal team use (2–5 people running occasional jobs), the variable costs are low.
