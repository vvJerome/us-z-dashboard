## us-z-dashboard — development, testing, and deployment
##
## Prerequisites: python3, node, npm, docker (Compose v2), psql
## Venvs are isolated per component — never install packages globally.

BACKEND_VENV  := backend/.venv
DASHBOARD_DIR := dashboard
PIPELINE_DIR  := ../us-z-3
PIPELINE_VENV := ../us-z-3/.venv

# Test database — runs via docker compose --profile test on port 5433
TEST_DB_URL := postgresql+asyncpg://scraper:test@localhost:5433/scraper_test

# Placeholder user inserted on first deploy (no auth yet)
PLACEHOLDER_USER_EMAIL ?= jerome@viableview.us
PLACEHOLDER_USER_ID    := 00000000-0000-0000-0000-000000000001

.DEFAULT_GOAL := help
.PHONY: help setup setup-backend setup-dashboard \
        deploy pull up up-build down logs \
        migrate flow-upload create-user \
        dev-infra dev-backend dev-dashboard \
        test test-unit test-feature test-smoke \
        test-backend test-dashboard test-pipeline test-migrations \
        lint lint-backend lint-dashboard format format-backend format-dashboard \
        migrate-test \
        _check-backend-venv _setup-test-db

# ── Help ─────────────────────────────────────────────────────────────────────

help:
	@echo ""
	@echo "  Setup"
	@echo "    make setup              Install all dependencies (backend + dashboard)"
	@echo "    make setup-backend      Create backend venv, install pip packages + ruff"
	@echo "    make setup-dashboard    npm install in dashboard/"
	@echo ""
	@echo "  Docker — full stack"
	@echo "    make deploy             Full deploy: pull → up → migrate → flow-upload → create-user → smoke"
	@echo "    make pull               docker compose pull (refresh GHCR images)"
	@echo "    make up                 docker compose up -d"
	@echo "    make up-build           docker compose up -d --build (build from source)"
	@echo "    make down               docker compose down"
	@echo "    make logs               Follow logs for all services"
	@echo "    make migrate            Apply Alembic migrations inside the backend container"
	@echo "    make flow-upload        Upload Kestra flow via API"
	@echo "    make create-user        Insert placeholder user into the database"
	@echo ""
	@echo "  Local dev"
	@echo "    make dev-infra          Start postgres + kestra via docker compose"
	@echo "    make dev-backend        Run FastAPI with hot reload on :8000"
	@echo "    make dev-dashboard      Run Vite dev server on :3000"
	@echo ""
	@echo "  Testing"
	@echo "    make test               Unit + feature + smoke (requires services up)"
	@echo "    make test-unit          All unit tests (backend + dashboard + pipeline)"
	@echo "    make test-feature       Feature tests — full workflow, real storage"
	@echo "    make test-smoke         Smoke tests — requires docker compose up"
	@echo "    make test-backend       Backend pytest only"
	@echo "    make test-dashboard     Dashboard vitest only"
	@echo "    make test-pipeline      Pipeline entrypoint pytest only"
	@echo "    make test-migrations    Alembic migration roundtrip"
	@echo ""
	@echo "  Quality"
	@echo "    make lint               ruff check + tsc --noEmit"
	@echo "    make format             ruff format + prettier"
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

# ── Docker — full stack ───────────────────────────────────────────────────────

deploy: pull up
	@echo "Waiting for services to be healthy..."
	@until docker compose exec backend curl -sf http://localhost:8000/health > /dev/null 2>&1; do sleep 3; done
	$(MAKE) migrate
	$(MAKE) flow-upload
	$(MAKE) create-user
	$(MAKE) test-smoke
	@echo ""
	@echo "Deploy complete. Dashboard at http://localhost"

pull:
	docker compose pull

up:
	docker compose up -d

up-build:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

migrate:
	docker compose exec backend sh -c "cd /srv/backend && PYTHONPATH=/srv alembic upgrade head"

flow-upload:
	@until curl -sf -o /dev/null http://localhost:8080/api/v1/flows; do \
	  echo "Waiting for Kestra API..."; sleep 5; done
	curl -s -X POST http://localhost:8080/api/v1/flows/import \
	  -F fileUpload=@kestra/flows/run-scraper.yml
	@echo ""
	@echo "Flow uploaded."

create-user:
	docker compose exec postgres psql -U scraper -d scraper -c \
	  "INSERT INTO users (id, email, password_hash, created_at) \
	   VALUES ('$(PLACEHOLDER_USER_ID)', '$(PLACEHOLDER_USER_EMAIL)', 'placeholder-no-auth-yet', now()) \
	   ON CONFLICT DO NOTHING;"
	@echo "User $(PLACEHOLDER_USER_EMAIL) ready."

# ── Local dev ────────────────────────────────────────────────────────────────

dev-infra:
	docker compose up -d postgres kestra
	@echo "Postgres on :5432, Kestra on :8080 (internal only)"

dev-backend: _check-backend-venv
	DATABASE_URL=postgresql+asyncpg://scraper@localhost:5432/scraper \
	  $(BACKEND_VENV)/bin/uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

dev-dashboard:
	cd $(DASHBOARD_DIR) && npm run dev

# ── Testing ──────────────────────────────────────────────────────────────────

test: test-unit test-feature test-smoke

test-unit: test-backend test-dashboard test-pipeline

test-backend: _check-backend-venv _setup-test-db
	TEST_DATABASE_URL=$(TEST_DB_URL) DATABASE_URL=$(TEST_DB_URL) \
	  $(BACKEND_VENV)/bin/python -m pytest backend/tests/ -v --tb=short -m "not feature"

test-feature: _check-backend-venv _setup-test-db
	TEST_DATABASE_URL=$(TEST_DB_URL) DATABASE_URL=$(TEST_DB_URL) \
	  $(BACKEND_VENV)/bin/python -m pytest backend/tests/feature/ -v --tb=short

test-migrations: _check-backend-venv _setup-test-db
	TEST_DATABASE_URL=$(TEST_DB_URL) DATABASE_URL=$(TEST_DB_URL) \
	  $(BACKEND_VENV)/bin/python -m pytest backend/tests/test_migrations.py -v --tb=short

test-dashboard:
	cd $(DASHBOARD_DIR) && node_modules/.bin/vitest run

test-pipeline:
	cd $(PIPELINE_DIR) && .venv/bin/pytest tests/test_entrypoint.py -v --tb=short

test-smoke:
	bash scripts/smoke-test.sh

_setup-test-db:
	docker compose --profile test up -d postgres-test
	@until docker compose --profile test exec postgres-test pg_isready -U scraper -q 2>/dev/null; do sleep 2; done

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

# ── Database (local venv, connects to Docker postgres) ────────────────────────

migrate-test: _check-backend-venv _setup-test-db
	cd backend && DATABASE_URL=$(TEST_DB_URL) \
	  ../$(BACKEND_VENV)/bin/alembic upgrade head

# ── Internal guards ───────────────────────────────────────────────────────────

_check-backend-venv:
	@test -f $(BACKEND_VENV)/bin/python || \
	  (echo "Backend venv missing. Run: make setup-backend" && exit 1)
