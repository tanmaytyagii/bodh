# Common tasks. Run `make help` for a list.

PY := backend/.venv/bin/python
SHELL := /bin/bash

.PHONY: help setup db ingest corpus api api-memory web test lint eval eval-answers e2e up down

help:
	@grep -E '^[a-z0-9-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-14s %s\n", $$1, $$2}'

setup: ## Create the Python venv and install backend + web dependencies
	cd backend && python3.11 -m venv .venv && .venv/bin/pip install -c constraints.txt -e ".[dev]"
	cd web && npm ci

db: ## Start PostgreSQL + pgvector on localhost:54329 (Docker must be running)
	docker compose up -d --wait db

corpus: ## Re-fetch sources (cached) and rebuild data/processed with validation
	cd backend && .venv/bin/python -m app.ingestion fetch && .venv/bin/python -m app.ingestion build

ingest: db ## Start the database, apply migrations, load the corpus and embed it (safe to re-run)
	cd backend && .venv/bin/python -m app.ingestion load

api: ## Run the API on :8000 with reload (needs the database: make db, or use api-memory)
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

api-memory: ## Run the API on :8000 without PostgreSQL, from the committed corpus
	cd backend && RETRIEVAL_BACKEND=memory .venv/bin/uvicorn app.main:app --reload --port 8000

web: ## Run the web app in development on :3000
	cd web && npm run dev

test: ## Backend unit/integration tests (no Docker or API key needed)
	cd backend && .venv/bin/python -m pytest

lint: ## Lint and type-check backend and web
	cd backend && .venv/bin/ruff check app tests && .venv/bin/ruff format --check app tests && .venv/bin/mypy
	cd web && npm run typecheck && npm run lint

eval: ## Retrieval evaluation on the labelled question set
	cd backend && .venv/bin/python -m app.evaluation.retrieval

eval-answers: ## End-to-end answer evaluation (needs a configured LLM; costs money)
	cd backend && .venv/bin/python -m app.evaluation.answers

e2e: ## Browser tests (needs `make api` running; starts the web app if none is on :3000)
	cd web && npx playwright test

up: ## Build and run everything in Docker (db, api, web)
	docker compose --profile app up --build

down: ## Stop the Docker services (the database keeps its data)
	docker compose --profile app down
