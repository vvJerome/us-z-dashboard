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

# ── Worker VPS (universal-scraper-v3) ─────────────────────────────────────────
WORKER_HOST="${WORKER_SSH_HOST:-95.217.63.54}"
WORKER_USER="${WORKER_SSH_USER:-devonly}"
WORKER_DATA="${WORKER_DATA_DIR:-/home/devonly/data}"
WORKER_KEY="${WORKER_SSH_KEY_PATH:-/root/.ssh/id_worker_v3}"
WORKER_CHECK=$(ssh -i "$WORKER_KEY" -o BatchMode=yes -o ConnectTimeout=8 \
  "$WORKER_USER@$WORKER_HOST" \
  "tmux -V >/dev/null 2>&1 && command -v sqlite3 >/dev/null 2>&1 && test -d $WORKER_DATA && echo ok" \
  2>/dev/null || echo "unreachable")
if [[ "$WORKER_CHECK" == "ok" ]]; then
  check "Worker VPS reachable (tmux + sqlite3 + data dir)" "ok"
else
  check "Worker VPS reachable (tmux + sqlite3 + data dir)" "$WORKER_CHECK — check SSH key, tmux, sqlite3, and $WORKER_DATA on $WORKER_HOST"
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
