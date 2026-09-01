## us-z-dashboard — local development and testing
##
## Prerequisites: python3, node, npm, docker compose
## Venvs are isolated per component — never install packages globally.
##
## Quick start: cp .env.template .env, fill it in, then `make setup dev`.

BACKEND_VENV  := backend/.venv
DASHBOARD_DIR := dashboard
PIPELINE_DIR  := ../us-z-3
PIPELINE_VENV := ../us-z-3/.venv

# Pulls POSTGRES_USER/POSTGRES_PASSWORD from .env (same creds the dockerized
# backend and the postgres container itself use) so `make dev-infra` and
# `make dev-backend` talk to the same database. Missing .env just means
# these targets fail with a clear connection error, not a silent mismatch.
-include .env

# Dev DB: the `postgres` compose service, reachable on localhost now that
# docker-compose.yml publishes it to 127.0.0.1:5432.
DB_URL := postgresql+asyncpg://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@localhost:5432/scraper

# Test DB: the `postgres-test` compose profile service — an isolated,
# tmpfs-backed instance on :5433 so tests never touch dev data. Matches the
# default already baked into backend/tests/conftest.py.
TEST_DB_URL := postgresql+asyncpg://scraper:test@localhost:5433/scraper_test

# Settings.worker_ssh_host has no default (never hardcode a real VPS IP) — tests
# and local dev need a harmless placeholder unless .env already provides one.
TEST_WORKER_SSH_HOST := test-worker.invalid

.DEFAULT_GOAL := help
.PHONY: help setup setup-backend setup-dashboard \
        dev dev-infra dev-backend dev-dashboard \
        test test-unit test-feature test-smoke \
        test-backend test-dashboard test-pipeline test-migrations \
        lint lint-backend lint-dashboard format format-backend format-dashboard \
        migrate migrate-test seed \
        build build-dashboard up up-build down clean \
        _check-backend-venv _test-infra

help: ## Show this help
	@echo ""
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ── Setup ────────────────────────────────────────────────────────────────────

setup: setup-backend setup-dashboard ## Install everything (backend + dashboard)

setup-backend: ## Create backend venv, install pip packages + ruff
	python3 -m venv $(BACKEND_VENV)
	$(BACKEND_VENV)/bin/pip install --quiet -r backend/requirements-test.txt
	$(BACKEND_VENV)/bin/pip install --quiet ruff
	@echo "Backend venv ready."

setup-dashboard: ## npm install in dashboard/
	cd $(DASHBOARD_DIR) && npm install
	@echo "Dashboard node_modules ready."

# ── Local dev ────────────────────────────────────────────────────────────────

dev: dev-infra ## Run postgres + backend + dashboard together (Ctrl+C stops all)
	@trap 'kill 0' EXIT INT TERM; \
	( $(MAKE) dev-backend ) & \
	( $(MAKE) dev-dashboard ) & \
	wait

dev-infra: ## Start postgres via docker compose
	docker compose up -d postgres
	@echo "Postgres on 127.0.0.1:5432"

dev-backend: _check-backend-venv ## Run FastAPI with hot reload on :8000
	cd backend && DATABASE_URL=$(DB_URL) WORKER_SSH_HOST=$${WORKER_SSH_HOST:-$(TEST_WORKER_SSH_HOST)} \
	  ../$(BACKEND_VENV)/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000

dev-dashboard: ## Run Vite dev server on :3000 (proxies /api → :8000)
	cd $(DASHBOARD_DIR) && npm run dev

# ── Testing ──────────────────────────────────────────────────────────────────

test: test-unit test-feature test-smoke ## Unit + feature + smoke (requires services up)

test-unit: test-backend test-dashboard test-pipeline ## All unit tests (backend + dashboard + pipeline)

test-backend: _check-backend-venv _test-infra ## Backend pytest only
	TEST_DATABASE_URL=$(TEST_DB_URL) DATABASE_URL=$(TEST_DB_URL) WORKER_SSH_HOST=$(TEST_WORKER_SSH_HOST) \
	  $(BACKEND_VENV)/bin/pytest backend/tests/ -v --tb=short -m "not feature" \
	    --ignore=backend/tests/test_migrations.py

test-feature: _check-backend-venv _test-infra ## Feature tests — full workflow, real storage
	TEST_DATABASE_URL=$(TEST_DB_URL) DATABASE_URL=$(TEST_DB_URL) WORKER_SSH_HOST=$(TEST_WORKER_SSH_HOST) \
	  $(BACKEND_VENV)/bin/pytest backend/tests/feature/ -v --tb=short

test-migrations: _check-backend-venv _test-infra ## Alembic migration roundtrip
	TEST_DATABASE_URL=$(TEST_DB_URL) DATABASE_URL=$(TEST_DB_URL) WORKER_SSH_HOST=$(TEST_WORKER_SSH_HOST) \
	  $(BACKEND_VENV)/bin/pytest backend/tests/test_migrations.py -v --tb=short

test-dashboard: ## Dashboard vitest only
	cd $(DASHBOARD_DIR) && node_modules/.bin/vitest run

test-pipeline: ## Pipeline entrypoint pytest only
	cd $(PIPELINE_DIR) && .venv/bin/pytest tests/test_entrypoint.py -v --tb=short

test-smoke: ## Smoke tests — requires docker compose up
	bash scripts/smoke-test.sh

_test-infra:
	docker compose --profile test up -d postgres-test
	@docker compose exec -T postgres-test pg_isready -U scraper -d scraper_test >/dev/null 2>&1 || \
	  (echo "Waiting for postgres-test..." && sleep 3)

# ── Quality ──────────────────────────────────────────────────────────────────

lint: lint-backend lint-dashboard ## ruff check + tsc --noEmit

lint-backend: _check-backend-venv
	$(BACKEND_VENV)/bin/ruff check backend/ --output-format=concise
	$(BACKEND_VENV)/bin/ruff format --check backend/

lint-dashboard:
	cd $(DASHBOARD_DIR) && node_modules/.bin/tsc --noEmit

format: format-backend format-dashboard ## ruff format + prettier

format-backend: _check-backend-venv
	$(BACKEND_VENV)/bin/ruff format backend/
	$(BACKEND_VENV)/bin/ruff check --fix backend/

format-dashboard:
	cd $(DASHBOARD_DIR) && node_modules/.bin/prettier --write "src/**/*.{ts,tsx}"

# ── Database ─────────────────────────────────────────────────────────────────

migrate: _check-backend-venv ## Apply migrations to dev database
	cd backend && DATABASE_URL=$(DB_URL) \
	  ../$(BACKEND_VENV)/bin/alembic upgrade head

migrate-test: _check-backend-venv _test-infra ## Apply migrations to test database
	cd backend && DATABASE_URL=$(TEST_DB_URL) \
	  ../$(BACKEND_VENV)/bin/alembic upgrade head

seed: _check-backend-venv ## Insert a local-dev VPS row so the "New job" form has something to select
	cd backend && DATABASE_URL=$(DB_URL) \
	  ../$(BACKEND_VENV)/bin/python -m scripts.seed

# ── Build ────────────────────────────────────────────────────────────────────

build: build-dashboard ## Build production assets (dashboard bundle)

build-dashboard: ## tsc -b && vite build → dashboard/dist
	cd $(DASHBOARD_DIR) && npm run build

# ── Docker ───────────────────────────────────────────────────────────────────

up: ## docker compose up -d (pull GHCR images)
	docker compose up -d

up-build: ## docker compose up -d --build (build from source)
	docker compose up -d --build

down: ## docker compose down
	docker compose down

clean: ## Remove venvs, node_modules, build output, and Python caches
	rm -rf $(BACKEND_VENV) $(DASHBOARD_DIR)/node_modules $(DASHBOARD_DIR)/dist
	find backend -type d -name __pycache__ -prune -exec rm -rf {} +
	find backend -type d -name .pytest_cache -prune -exec rm -rf {} +
	@echo "Cleaned. Run 'make setup' to reinstall."

# ── Internal guards ───────────────────────────────────────────────────────────

_check-backend-venv:
	@test -f $(BACKEND_VENV)/bin/python || \
	  (echo "Backend venv missing. Run: make setup-backend" && exit 1)
