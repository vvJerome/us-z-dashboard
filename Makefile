## us-z-dashboard — local development and testing
##
## Prerequisites: python3, node, npm, docker-compose, psql (for test DB setup)
## Venvs are isolated per component — never install packages globally.

BACKEND_VENV  := backend/.venv
DASHBOARD_DIR := dashboard
PIPELINE_DIR  := ../us-z-3
PIPELINE_VENV := ../us-z-3/.venv

# Databases
DB_URL      := postgresql+asyncpg://postgres@localhost:5432/scraper
TEST_DB_URL := postgresql+asyncpg://postgres@localhost:5432/scraper_test

.DEFAULT_GOAL := help
.PHONY: help setup setup-backend setup-dashboard \
        dev-infra dev-backend dev-dashboard \
        test test-unit test-feature test-smoke \
        test-backend test-dashboard test-pipeline test-migrations \
        lint lint-backend lint-dashboard format format-backend format-dashboard \
        migrate migrate-test \
        up up-build down \
        clean

# ── Help ─────────────────────────────────────────────────────────────────────

help:
	@echo ""
	@echo "  Setup"
	@echo "    make setup              Install all dependencies (backend + dashboard)"
	@echo "    make setup-backend      Create backend venv, install pip packages + ruff"
	@echo "    make setup-dashboard    npm install in dashboard/"
	@echo ""
	@echo "  Local dev"
	@echo "    make dev-infra          Start postgres + kestra via docker-compose"
	@echo "    make dev-backend        Run FastAPI with hot reload on :8000"
	@echo "    make dev-dashboard      Run Vite dev server on :3000 (proxies /api → :8000)"
	@echo ""
	@echo "  Testing"
	@echo "    make test               Unit + feature + smoke (requires services up)"
	@echo "    make test-unit          All unit tests (backend + dashboard + pipeline)"
	@echo "    make test-feature       Feature tests — full workflow, real storage"
	@echo "    make test-smoke         Smoke tests — requires docker-compose up"
	@echo "    make test-backend       Backend pytest only"
	@echo "    make test-dashboard     Dashboard vitest only"
	@echo "    make test-pipeline      Pipeline entrypoint pytest only"
	@echo "    make test-migrations    Alembic migration roundtrip"
	@echo ""
	@echo "  Quality"
	@echo "    make lint               ruff check + tsc --noEmit"
	@echo "    make format             ruff format + prettier"
	@echo ""
	@echo "  Database"
	@echo "    make migrate            Apply migrations to dev database"
	@echo "    make migrate-test       Apply migrations to test database"
	@echo ""
	@echo "  Docker"
	@echo "    make up                 docker-compose up -d (pull GHCR images)"
	@echo "    make up-build           docker-compose up -d --build (build from source)"
	@echo "    make down               docker-compose down"
	@echo ""

# ── Setup ────────────────────────────────────────────────────────────────────

setup: setup-backend setup-dashboard

setup-backend:
	python3 -m venv $(BACKEND_VENV)
	$(BACKEND_VENV)/bin/pip install --quiet -r backend/requirements-test.txt
	$(BACKEND_VENV)/bin/pip install --quiet ruff
	@echo "Backend venv ready."

setup-dashboard:
	cd $(DASHBOARD_DIR) && npm install
	@echo "Dashboard node_modules ready."

# ── Local dev ────────────────────────────────────────────────────────────────

dev-infra:
	docker-compose up -d postgres kestra
	@echo "Postgres on :5432, Kestra on :8080 (internal only)"

dev-backend: _check-backend-venv
	cd backend && DATABASE_URL=$(DB_URL) \
	  ../$(BACKEND_VENV)/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000

dev-dashboard:
	cd $(DASHBOARD_DIR) && npm run dev

# ── Testing ──────────────────────────────────────────────────────────────────

test: test-unit test-feature test-smoke

test-unit: test-backend test-dashboard test-pipeline

test-backend: _check-backend-venv _setup-test-db
	TEST_DATABASE_URL=$(TEST_DB_URL) DATABASE_URL=$(TEST_DB_URL) \
	  $(BACKEND_VENV)/bin/pytest backend/tests/ -v --tb=short -m "not feature"

test-feature: _check-backend-venv _setup-test-db
	TEST_DATABASE_URL=$(TEST_DB_URL) DATABASE_URL=$(TEST_DB_URL) \
	  $(BACKEND_VENV)/bin/pytest backend/tests/feature/ -v --tb=short

test-migrations: _check-backend-venv _setup-test-db
	TEST_DATABASE_URL=$(TEST_DB_URL) DATABASE_URL=$(TEST_DB_URL) \
	  $(BACKEND_VENV)/bin/pytest backend/tests/test_migrations.py -v --tb=short

test-dashboard:
	cd $(DASHBOARD_DIR) && node_modules/.bin/vitest run

test-pipeline:
	cd $(PIPELINE_DIR) && .venv/bin/pytest tests/test_entrypoint.py -v --tb=short

test-smoke:
	bash scripts/smoke-test.sh

_setup-test-db:
	@psql -h localhost -U postgres -c "CREATE DATABASE scraper_test;" 2>/dev/null || true

# ── Quality ──────────────────────────────────────────────────────────────────

lint: lint-backend lint-dashboard

lint-backend: _check-backend-venv
	$(BACKEND_VENV)/bin/ruff check backend/ --output-format=concise
	$(BACKEND_VENV)/bin/ruff format --check backend/

lint-dashboard:
	cd $(DASHBOARD_DIR) && node_modules/.bin/tsc --noEmit

format: format-backend format-dashboard

format-backend: _check-backend-venv
	$(BACKEND_VENV)/bin/ruff format backend/
	$(BACKEND_VENV)/bin/ruff check --fix backend/

format-dashboard:
	cd $(DASHBOARD_DIR) && node_modules/.bin/prettier --write "src/**/*.{ts,tsx}"

# ── Database ─────────────────────────────────────────────────────────────────

migrate: _check-backend-venv
	cd backend && DATABASE_URL=$(DB_URL) \
	  ../$(BACKEND_VENV)/bin/alembic upgrade head

migrate-test: _check-backend-venv _setup-test-db
	cd backend && DATABASE_URL=$(TEST_DB_URL) \
	  ../$(BACKEND_VENV)/bin/alembic upgrade head

# ── Docker ───────────────────────────────────────────────────────────────────

up:
	docker-compose up -d

up-build:
	docker-compose up -d --build

down:
	docker-compose down

# ── Internal guards ───────────────────────────────────────────────────────────

_check-backend-venv:
	@test -f $(BACKEND_VENV)/bin/python || \
	  (echo "Backend venv missing. Run: make setup-backend" && exit 1)
