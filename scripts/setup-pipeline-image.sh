#!/usr/bin/env bash
# Usage: ./scripts/setup-pipeline-image.sh <user@host> <ssh_key_path> [webhook_key]
# Full VPS setup: Docker (if missing), Kestra, patched pipeline image.
# Reads SERPER_API_KEY and ZUHAL_API_KEY from the repo .env file.
#
# Example:
#   ./scripts/setup-pipeline-image.sh root@23.238.97.172 ~/.ssh/id_vps2 vps2-webhook-key

set -euo pipefail

HOST="${1:?Usage: $0 <user@host> <ssh_key_path> [webhook_key]}"
KEY="${2:?Usage: $0 <user@host> <ssh_key_path> [webhook_key]}"
WEBHOOK_KEY="${3:-$(openssl rand -hex 16)}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
WRAPPER_DIR="$REPO_ROOT/kestra/vps-wrapper"
ENV_FILE="$REPO_ROOT/.env"

# Load API keys from local .env
SERPER_API_KEY=$(grep '^SERPER_API_KEY=' "$ENV_FILE" | cut -d= -f2-)
ZUHAL_API_KEY=$(grep '^ZUHAL_API_KEY=' "$ENV_FILE" | cut -d= -f2-)

SSH="ssh -i $KEY -o StrictHostKeyChecking=no"
SCP="scp -i $KEY -o StrictHostKeyChecking=no"

echo "==> Host: $HOST"
echo "==> Webhook key: $WEBHOOK_KEY"

# ── 1. Docker ────────────────────────────────────────────────────────────────
echo ""
echo "==> [1/5] Checking Docker..."
if ! $SSH "$HOST" "docker info >/dev/null 2>&1"; then
  echo "    Docker not found — installing..."
  $SSH "$HOST" "curl -fsSL https://get.docker.com | sh" 2>&1 | tail -3
  echo "    Docker installed."
else
  echo "    Docker already present."
fi

# ── 2. Directories ───────────────────────────────────────────────────────────
echo ""
echo "==> [2/5] Creating directories..."
$SSH "$HOST" "mkdir -p /root/kestra/flows /data /tmp/kestra-tmp"

# Docker socket must be world-writable so Kestra container can launch jobs
$SSH "$HOST" "chmod 666 /var/run/docker.sock"

# ── 3. Kestra config files ───────────────────────────────────────────────────
echo ""
echo "==> [3/5] Writing Kestra config..."

$SSH "$HOST" "cat > /root/kestra/kestra.yml" <<'KESTRA_YML'
kestra:
  storage:
    type: local
    local:
      basePath: /app/storage
  tasks:
    tmp-dir:
      path: /tmp/kestra-tmp
KESTRA_YML

$SSH "$HOST" "cat > /root/kestra/docker-compose.yml" <<COMPOSE
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_DB: kestra
      POSTGRES_USER: kestra
      POSTGRES_PASSWORD: kestrapass
    volumes:
      - postgres_data:/var/lib/postgresql/data

  kestra:
    image: kestra/kestra:latest-full
    restart: unless-stopped
    command: server standalone
    depends_on:
      - postgres
    volumes:
      - kestra_storage:/app/storage
      - ./flows:/app/flows
      - ./kestra.yml:/app/kestra.yml:ro
      - /var/run/docker.sock:/var/run/docker.sock
      - /data:/data
      - /tmp/kestra-tmp:/tmp/kestra-tmp
      - /usr/bin/docker:/usr/bin/docker:ro
    ports:
      - "8080:8080"
    environment:
      MICRONAUT_CONFIG_FILES: /app/kestra.yml
      DATASOURCES_POSTGRES_URL: "jdbc:postgresql://postgres:5432/kestra"
      DATASOURCES_POSTGRES_DRIVER_CLASS_NAME: "org.postgresql.Driver"
      DATASOURCES_POSTGRES_USERNAME: kestra
      DATASOURCES_POSTGRES_PASSWORD: kestrapass
      KESTRA_REPOSITORY_TYPE: postgres
      KESTRA_QUEUE_TYPE: postgres
      KESTRA_FLOWS_BASE_PATH: /app/flows
      KESTRA_SERVER_BASIC_AUTH_ENABLED: "false"
      KESTRA_WEBHOOK_KEY: "${WEBHOOK_KEY}"
      SERPER_API_KEY: "${SERPER_API_KEY}"
      ZUHAL_API_KEY: "${ZUHAL_API_KEY}"
      RACKNERD_HOST: ""
      RACKNERD_SSH_USER: egress
      RACKNERD_SSH_PORT: "22"
      RACKNERD_SOCKS_PORT: "1080"
      BBOPS_BASE_URL: "https://email-verifier.bbops.io"
      JAVA_OPTS: "-Xms256m -Xmx512m"

volumes:
  postgres_data:
  kestra_storage:
COMPOSE

$SSH "$HOST" "cat > /root/kestra/flows/run-scraper.yml" <<'FLOW'
id: run-scraper
namespace: prod
description: "Runs the us-z-3 email discovery pipeline as an isolated Docker container."

inputs:
  - id: job_id
    type: STRING
    description: "UUID assigned by FastAPI when the job was created"
  - id: input_file_key
    type: STRING
    description: "Relative path within /data to the uploaded input file"
  - id: config
    type: STRING
    description: 'JSON config toggles: {"enable_proxy": false, "skip_duplicates": true}'
    defaults: '{"enable_proxy": false, "skip_duplicates": true}'

concurrency:
  limit: 1
  behavior: QUEUE

tasks:
  - id: scrape
    type: io.kestra.plugin.docker.Run
    containerImage: "us-z-3-local:latest"
    pullPolicy: NEVER
    timeout: PT72H
    memory:
      memory: "512Mb"
    cpu:
      cpus: 0.5
    volumes:
      - "/data:/data"
    env:
      JOB_ID: "{{ inputs.job_id }}"
      INPUT_FILE_KEY: "{{ inputs.input_file_key }}"
      CONFIG: "{{ inputs.config }}"
      DATA_DIR: "/data"
      SERPER_API_KEY: "{{ envs.SERPER_API_KEY }}"
      ZUHAL_API_KEY: "{{ envs.ZUHAL_API_KEY }}"
      RACKNERD_HOST: "{{ envs.RACKNERD_HOST | default('') }}"
      RACKNERD_SSH_USER: "{{ envs.RACKNERD_SSH_USER | default('egress') }}"
      RACKNERD_SSH_PORT: "{{ envs.RACKNERD_SSH_PORT | default('22') }}"
      RACKNERD_SOCKS_PORT: "{{ envs.RACKNERD_SOCKS_PORT | default('1080') }}"
      BBOPS_BASE_URL: "{{ envs.BBOPS_BASE_URL | default('https://email-verifier.bbops.io') }}"

errors:
  - id: mark-failed
    type: io.kestra.plugin.core.flow.Sequential
    tasks:
      - id: log-failure
        type: io.kestra.plugin.core.log.Log
        message: "Job {{ inputs.job_id }} failed — FastAPI will sync via Kestra execution API poll."
        level: ERROR

triggers:
  - id: api
    type: io.kestra.plugin.core.trigger.Webhook
    key: "{{ envs.KESTRA_WEBHOOK_KEY }}"
FLOW

# ── 4. Start Kestra ──────────────────────────────────────────────────────────
echo ""
echo "==> [4/5] Starting Kestra..."
$SSH "$HOST" "cd /root/kestra && docker compose up -d"

echo "    Waiting for Kestra to be ready..."
for i in $(seq 1 30); do
  if $SSH "$HOST" "curl -sf http://localhost:8080/api/v1/flows/prod/run-scraper >/dev/null 2>&1 || curl -o /dev/null -sw '%{http_code}' http://localhost:8080/api/v1/flows 2>/dev/null | grep -qE '^[24]'"; then
    echo "    Kestra is up."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "    ERROR: Kestra did not start in time. Check: ssh -i $KEY $HOST 'cd /root/kestra && docker compose logs kestra'"
    exit 1
  fi
  echo "    Waiting... ($i/30)"
  sleep 5
done

# ── 5. Pipeline image ────────────────────────────────────────────────────────
echo ""
echo "==> Importing Kestra flow..."
$SSH "$HOST" "curl -sf -X POST http://localhost:8080/api/v1/flows/import -F fileUpload=@/root/kestra/flows/run-scraper.yml"
echo ""

echo "==> [5/5] Building patched pipeline image (us-z-3-local:latest)..."
$SSH "$HOST" "mkdir -p /root/us-z-3-wrapper"
$SCP "$WRAPPER_DIR/Dockerfile" "$WRAPPER_DIR/patch_zuhal.py" "$HOST:/root/us-z-3-wrapper/"
$SSH "$HOST" "cd /root/us-z-3-wrapper && docker build -t us-z-3-local:latest ." 2>&1 | grep -E "Step|step|Successfully|ERROR|error" || true

echo ""
echo "========================================"
echo "  $HOST is fully set up!"
echo "  Kestra UI : http://$(echo "$HOST" | cut -d@ -f2):8080"
echo "  Webhook   : $WEBHOOK_KEY"
echo "========================================"
