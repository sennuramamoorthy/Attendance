# Takshashila Attendance — task runner
#
# Run `make` or `make help` to see all targets.

SHELL := /bin/bash

FRONTEND   := frontend
BACKEND    := backend
PYTHON     := $(BACKEND)/.venv/bin/python
PIP        := $(BACKEND)/.venv/bin/pip
ALEMBIC    := $(BACKEND)/.venv/bin/alembic
UVICORN    := $(BACKEND)/.venv/bin/uvicorn
RUFF       := $(BACKEND)/.venv/bin/ruff

BACKEND_PORT  ?= 8001
FRONTEND_PORT ?= 3000

.DEFAULT_GOAL := help

# ────────────────────────────────────────────────────────
# Help
# ────────────────────────────────────────────────────────

.PHONY: help
help: ## Show available targets
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage: make \033[36m<target>\033[0m\n\n"} \
		/^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2 } \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(MAKEFILE_LIST)
	@echo

##@ Setup

.PHONY: install
install: install-backend install-frontend ## Install dependencies for both apps

.PHONY: install-backend
install-backend: ## Create venv and install Python deps
	@if [ ! -d "$(BACKEND)/.venv" ]; then \
		echo "→ Creating Python venv"; \
		python3 -m venv $(BACKEND)/.venv; \
	fi
	@echo "→ Installing backend deps"
	@$(PIP) install -q -r $(BACKEND)/requirements.txt

.PHONY: install-frontend
install-frontend: ## Install frontend npm deps
	@echo "→ Installing frontend deps"
	@cd $(FRONTEND) && npm install

##@ Dev

.PHONY: dev-backend
dev-backend: ## Run backend dev server with reload (port 8001)
	@cd $(BACKEND) && .venv/bin/uvicorn app.main:app --reload --port $(BACKEND_PORT)

.PHONY: dev-frontend
dev-frontend: ## Run frontend dev server with turbopack (port 3000)
	@cd $(FRONTEND) && npm run dev

.PHONY: dev
dev: ## Run both dev servers in parallel (Ctrl+C stops both)
	@$(MAKE) -j2 dev-backend dev-frontend

##@ Database

.PHONY: db-up
db-up: ## Start PostgreSQL (and only the DB)
	@docker compose up -d db
	@echo "→ Waiting for DB to be ready..."
	@until docker exec attendance-db-1 pg_isready -U postgres > /dev/null 2>&1; do sleep 1; done
	@echo "→ DB is ready"

.PHONY: supabase-up
supabase-up: db-up ## Start Supabase auth (gotrue + kong)
	@docker compose up -d supabase-auth supabase-kong
	@echo "→ Waiting for Supabase auth..."
	@for i in $$(seq 1 30); do \
		if curl -fs http://localhost:9999/health > /dev/null 2>&1; then \
			echo "→ Supabase auth ready"; \
			exit 0; \
		fi; \
		sleep 1; \
	done; \
	echo "→ Timed out waiting for Supabase auth"; exit 1

.PHONY: db-down
db-down: ## Stop the DB container
	@docker compose stop db

.PHONY: migrate
migrate: ## Apply Alembic migrations
	@cd $(BACKEND) && .venv/bin/alembic upgrade head

.PHONY: migrate-create
migrate-create: ## Generate a new migration (usage: make migrate-create m="add X")
	@if [ -z "$(m)" ]; then echo "Usage: make migrate-create m=\"description\""; exit 1; fi
	@cd $(BACKEND) && .venv/bin/alembic revision --autogenerate -m "$(m)"

.PHONY: migrate-down
migrate-down: ## Roll back one migration
	@cd $(BACKEND) && .venv/bin/alembic downgrade -1

.PHONY: seed
seed: ## Seed the database with sample data
	@cd $(BACKEND) && PYTHONPATH=. .venv/bin/python scripts/seed.py

.PHONY: seed-admin
seed-admin: supabase-up migrate ## Create an admin login (usage: make seed-admin EMAIL=... PASSWORD=...)
	@if [ -z "$(EMAIL)" ] || [ -z "$(PASSWORD)" ]; then \
		echo "Usage: make seed-admin EMAIL=admin@takshashila.edu PASSWORD=Admin@123"; \
		exit 1; \
	fi
	@cd $(BACKEND) && PYTHONPATH=. .venv/bin/python scripts/seed_admin.py "$(EMAIL)" "$(PASSWORD)"

.PHONY: seed-demo
seed-demo: supabase-up migrate seed ## Populate demo users for every role + students + attendance history
	@cd $(BACKEND) && PYTHONPATH=. .venv/bin/python scripts/seed_demo.py

.PHONY: db-shell
db-shell: ## Open a psql shell to the dev database
	@docker exec -it attendance-db-1 psql -U postgres -d attendance

##@ Build

.PHONY: build
build: build-backend build-frontend ## Build both apps for production

.PHONY: build-backend
build-backend: install-backend ## Verify backend imports cleanly
	@echo "→ Verifying backend"
	@cd $(BACKEND) && PYTHONPATH=. .venv/bin/python -c "from app.main import app; print(f'OK — {app.title}')"

.PHONY: build-frontend
build-frontend: ## Production build for Next.js (standalone output)
	@cd $(FRONTEND) && npm run build

##@ Verify

.PHONY: lint
lint: lint-backend lint-frontend ## Lint both apps

.PHONY: lint-backend
lint-backend: ## Run ruff on backend
	@cd $(BACKEND) && .venv/bin/ruff check app/ scripts/

.PHONY: lint-fix
lint-fix: ## Auto-fix lint issues in both apps
	@cd $(BACKEND) && .venv/bin/ruff check app/ scripts/ --fix
	@cd $(FRONTEND) && npx eslint src --fix

.PHONY: lint-frontend
lint-frontend: ## Run ESLint on frontend
	@cd $(FRONTEND) && npx eslint src

.PHONY: typecheck
typecheck: ## Type-check the frontend (TypeScript)
	@cd $(FRONTEND) && npx tsc --noEmit

.PHONY: check
check: lint typecheck build ## Full verification (lint + typecheck + build)

##@ Docker

.PHONY: docker-build
docker-build: ## Build all docker images
	@docker compose build

.PHONY: docker-up
docker-up: ## Start the full stack (db + backend + frontend + supabase)
	@docker compose up -d
	@echo "→ Stack starting. Frontend: http://localhost:$(FRONTEND_PORT)  Backend: http://localhost:$(BACKEND_PORT)/docs"

.PHONY: docker-down
docker-down: ## Stop and remove all containers
	@docker compose down

.PHONY: docker-restart
docker-restart: docker-down docker-up ## Restart the full stack

.PHONY: docker-logs
docker-logs: ## Tail logs from all services
	@docker compose logs -f --tail=100

.PHONY: docker-ps
docker-ps: ## Show running services
	@docker compose ps

.PHONY: docker-clean
docker-clean: ## Stop everything and DELETE the database volume
	@echo "⚠  This will delete the database. Press Ctrl+C in 5s to cancel."
	@sleep 5
	@docker compose down -v

##@ Deploy

.PHONY: deploy
deploy: build docker-build docker-up migrate ## Build images, start stack, run migrations
	@echo ""
	@echo "✓ Deployed."
	@echo "  Frontend: http://localhost:$(FRONTEND_PORT)"
	@echo "  Backend:  http://localhost:$(BACKEND_PORT)/docs"

.PHONY: deploy-fresh
deploy-fresh: docker-clean docker-build docker-up migrate seed ## Wipe DB + redeploy + seed
	@echo "✓ Fresh deployment complete with seeded data."

##@ Cleanup

.PHONY: clean
clean: ## Remove build artifacts (keeps node_modules and venv)
	@rm -rf $(FRONTEND)/.next $(FRONTEND)/tsconfig.tsbuildinfo
	@find $(BACKEND) -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

.PHONY: nuke
nuke: clean ## Also remove node_modules and Python venv
	@rm -rf $(FRONTEND)/node_modules $(BACKEND)/.venv
