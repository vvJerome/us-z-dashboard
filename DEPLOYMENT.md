# Known Edge Cases and Deployment Gotchas

Issues discovered during local test run (May 2026). All resolved in the codebase — this file documents *why* each decision was made.

---

## Kestra

### Flow schema changes (latest-full image)

The `kestra/kestra:latest-full` image ships a newer plugin version than the docs suggest. Field names changed:

| Old field | New field | Where |
|-----------|-----------|-------|
| `image` | `containerImage` | `io.kestra.plugin.docker.Run` task |
| `default` | `defaults` | Flow `inputs` |
| `resources.memory` / `resources.cpus` | Removed — not supported | `io.kestra.plugin.docker.Run` task |

### Webhook trigger key cannot use `{{ envs.VAR }}`

Kestra does not resolve expression templates in trigger `key` fields. The webhook key must be a static string in the flow YAML. The key is committed to the repo but the repo is private — this is acceptable.

### Storage config requires mounted YAML, not env vars

`KESTRA_STORAGE_LOCAL_BASE_PATH` and similar env vars do not map correctly to the `basePath` Java field due to Micronaut's underscore-to-dot conversion splitting `BASE_PATH` into two levels (`base.path`) instead of one camelCase field (`basePath`). Fix: mount `kestra/application.yml` and point Micronaut to it via `MICRONAUT_CONFIG_FILES`.

### Environment variables in flow expressions (`{{ envs.VAR }}`)

Even with `MICRONAUT_CONFIG_FILES` set, `{{ envs.VAR }}` expressions in flow tasks fail with "strict variables" error unless `kestra.variables.env-vars-prefix: ""` is configured. For simplicity, the container image is hardcoded in the flow. If dynamic image tags are needed later, this config key must be verified against the exact Kestra version in use.

### Docker-in-Docker on macOS

Kestra's Docker plugin uses `/var/run/docker.sock` to spawn pipeline containers. On macOS with Docker Desktop, the socket runs inside a VM and Kestra gets `Permission denied (errno 13)` when trying to use it via JNA. **This only affects local macOS development.** On the Linux VPS, the socket is native and works correctly.

---

## Backend

### Dockerfile package structure

The backend `WORKDIR` is `/srv` and the code is copied into `/srv/backend/`. This lets uvicorn run the app as `backend.main:app`, which allows the relative imports (`from .database import engine`) in the source files to resolve correctly. Running as `main:app` from `/app` fails because Python treats it as a top-level module with no package context.

### Alembic migration command

Because the package lives at `/srv/backend/`, alembic must be run from `/srv/backend/` with `PYTHONPATH=/srv` so it can import `backend.models`:

```bash
docker compose exec backend sh -c "cd /srv/backend && PYTHONPATH=/srv alembic upgrade head"
```

Running `alembic upgrade head` from `/srv` or without `PYTHONPATH` will fail with `ModuleNotFoundError`.

### Placeholder user UUID

The backend hardcodes `_PLACEHOLDER_USER_ID = UUID("00000000-0000-0000-0000-000000000001")` for all jobs until auth is implemented. The first user inserted into the database **must use this exact UUID**, otherwise all job creation requests fail with a foreign key violation:

```sql
INSERT INTO users (id, email, password_hash, created_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'jerome@viableview.us', 'placeholder-no-auth-yet', now());
```

---

## GHCR / Docker images

### Mixed-case owner in image tags

`${{ github.repository_owner }}` resolves to `vvJerome` (mixed case). GHCR rejects mixed-case image names. All workflows use a `Set lowercase owner` step that pipes through `tr '[:upper:]' '[:lower:]'` before building.

### Package visibility for `docker compose pull`

Images built from a private repo default to private packages. The VPS cannot pull without either:
- Making packages public (preferred for simplicity)
- Or `docker login ghcr.io` with a PAT that has `read:packages` scope

All three packages (`us-z-backend`, `us-z-dashboard-app`, `us-z-3`) must be explicitly made public in GitHub package settings.

### `us-z-3` package write permission

The `build-pipeline.yml` workflow in `us-z-dashboard` builds the `us-z-3` image. Since that package was first created by the `us-z-3` repo, the `us-z-dashboard` Actions token needs explicit write permission. Grant it at: GitHub → Packages → `us-z-3` → Settings → Manage Actions access → Add `vvJerome/us-z-dashboard` as Admin.

---

## VPS (Racknerd KVM-2GB)

### Kestra SSH key mount fails if file is absent

The Kestra container mounts `${RACKNERD_SSH_KEY_PATH}` at startup. If the file does not exist on the host, Docker creates an empty directory at that path instead, causing Kestra to crash. Always create the key file before `docker compose up`:

```bash
ssh-keygen -t ed25519 -f /root/.ssh/racknerd_egress -N "" -C "placeholder"
```

### Memory limits require swap

The combined memory limit of all services is ~1.4 GB. With the OS overhead (~300 MB), total usage approaches 1.7 GB on a 2 GB VPS. Kestra's JVM startup spike can briefly exceed this. Without swap, the kernel will OOM-kill Kestra before it finishes booting. Add 2 GB swap before starting the stack:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### Platform mismatch warning on Apple Silicon

Docker images are built for `linux/amd64`. On Apple Silicon (M1/M2/M3), Docker Desktop runs them via Rosetta 2 emulation. The warning `requested image's platform (linux/amd64) does not match detected host platform (linux/arm64/v8)` is expected and harmless — the images run correctly. The VPS is `linux/amd64` and runs them natively.

### Smoke test volume name

The smoke test checks `docker volume inspect data_volume` but Docker Compose prefixes volumes with the project name (`us-z-dashboard_data_volume`). The script uses `docker volume ls | grep data_volume` to handle both cases.
