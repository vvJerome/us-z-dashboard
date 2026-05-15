---
description: Pre-deployment checklist. Verifies env vars, pending migrations, Docker images, Kestra flow status, service connectivity, and data volume. Outputs PASS/FAIL per item.
allowed-tools: [Bash, Read]
---

Run the following deployment checklist. Output each result as `[PASS]` or `[FAIL]` with a one-line explanation. Do not proceed with deployment if any item FAILS.

## 1. Environment variables

Check that `.env` exists and contains all required keys:

```bash
for key in DATABASE_URL JWT_SECRET_KEY KESTRA_BASE_URL KESTRA_WEBHOOK_KEY; do
  if grep -q "^${key}=" .env 2>/dev/null; then
    echo "[PASS] $key present"
  else
    echo "[FAIL] $key missing from .env"
  fi
done
```

## 2. .env not committed to git

```bash
if git ls-files .env --error-unmatch 2>/dev/null; then
  echo "[FAIL] .env is tracked by git — remove it immediately"
else
  echo "[PASS] .env is not committed"
fi
```

## 3. Pending Alembic migrations

```bash
cd backend
CURRENT=$(alembic current 2>/dev/null | grep -oP '[a-f0-9]+(?= \(head\))' || echo "none")
HEAD=$(alembic heads 2>/dev/null | grep -oP '^[a-f0-9]+' || echo "unknown")
if [[ "$CURRENT" == "$HEAD" ]]; then
  echo "[PASS] Migrations up to date (head: $HEAD)"
else
  echo "[FAIL] Unapplied migrations — current: $CURRENT, head: $HEAD — run: alembic upgrade head"
fi
cd ..
```

## 4. PostgreSQL connectivity

```bash
source .env 2>/dev/null
if pg_isready -d "$DATABASE_URL" -q; then
  echo "[PASS] PostgreSQL accepting connections"
else
  echo "[FAIL] PostgreSQL not reachable"
fi
```

## 5. Kestra API + flow active

```bash
source .env 2>/dev/null
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "${KESTRA_BASE_URL}/api/v1/flows/prod/run-scraper" 2>/dev/null || echo "000")
if [[ "$STATUS" == "200" ]]; then
  echo "[PASS] Kestra flow prod/run-scraper is active"
elif [[ "$STATUS" == "000" ]]; then
  echo "[FAIL] Kestra not reachable at $KESTRA_BASE_URL"
else
  echo "[FAIL] Kestra flow not found (HTTP $STATUS) — upload kestra/flows/run-scraper.yml"
fi
```

## 6. Docker data volume

```bash
if docker volume inspect data_volume &>/dev/null; then
  echo "[PASS] data_volume exists"
else
  echo "[FAIL] data_volume missing — run: docker compose up -d"
fi
```

## 7. Docker images present (ask for GitHub org if unknown)

```bash
# Replace {ORG} with the actual GitHub org
for image in backend dashboard; do
  if docker manifest inspect "ghcr.io/{ORG}/${image}:latest" &>/dev/null; then
    echo "[PASS] ghcr.io/{ORG}/${image}:latest found"
  else
    echo "[FAIL] ghcr.io/{ORG}/${image}:latest not found — push via GitHub Actions"
  fi
done
```

## Output format

```
[PASS] DATABASE_URL present
[PASS] JWT_SECRET_KEY present
[FAIL] KESTRA_WEBHOOK_KEY missing from .env
[PASS] .env is not committed
[FAIL] Unapplied migrations — run: alembic upgrade head
...

RESULT: 2 failures — do not deploy until resolved.
```

If all items pass: "All checks passed — safe to deploy."
