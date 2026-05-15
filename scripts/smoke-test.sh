#!/usr/bin/env bash
# Smoke tests — verifies all services are reachable after docker compose up.
# Run from the us-z-dashboard project root.
# Exit code: 0 if all pass, 1 if any fail.

set -uo pipefail

PASS=0
FAIL=0

check() {
  local label="$1"
  local result="$2"
  if [[ "$result" == "ok" ]]; then
    echo "[PASS] $label"
    (( PASS++ )) || true
  else
    echo "[FAIL] $label — $result"
    (( FAIL++ )) || true
  fi
}

# ── PostgreSQL ────────────────────────────────────────────────────────────────
if pg_isready -h localhost -p 5432 -U scraper -d scraper -q 2>/dev/null; then
  check "PostgreSQL accepting connections" "ok"
else
  check "PostgreSQL accepting connections" "pg_isready failed — is docker compose up?"
fi

# ── FastAPI backend ───────────────────────────────────────────────────────────
HEALTH=$(curl -sf http://localhost:8000/health 2>/dev/null || echo "unreachable")
if echo "$HEALTH" | grep -q '"ok"'; then
  check "Backend health endpoint" "ok"
else
  check "Backend health endpoint" "got: $HEALTH"
fi

# ── Kestra API ────────────────────────────────────────────────────────────────
KESTRA_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:8080/api/v1/flows/prod/run-scraper 2>/dev/null || echo "000")
if [[ "$KESTRA_STATUS" == "200" ]]; then
  check "Kestra flow prod/run-scraper is active" "ok"
elif [[ "$KESTRA_STATUS" == "000" ]]; then
  check "Kestra API reachable" "unreachable — is Kestra running?"
else
  check "Kestra flow prod/run-scraper is active" "HTTP $KESTRA_STATUS — upload the flow first"
fi

# ── Docker data volume ────────────────────────────────────────────────────────
if docker volume inspect data_volume &>/dev/null; then
  check "data_volume exists" "ok"
else
  check "data_volume exists" "missing — run: docker compose up -d"
fi

# ── nginx routing ─────────────────────────────────────────────────────────────
NGINX_API=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost/health 2>/dev/null || echo "000")
if [[ "$NGINX_API" == "200" ]]; then
  check "nginx → backend route (/health)" "ok"
else
  check "nginx → backend route (/health)" "HTTP $NGINX_API"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
