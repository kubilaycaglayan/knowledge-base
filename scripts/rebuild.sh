#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-know-prod}"

echo "Stopping the production-shaped stack (database volume is preserved)..."
docker compose down

echo "Rebuilding all production-shaped images without cache..."
docker compose build --pull --no-cache

echo "Starting the rebuilt stack..."
docker compose up -d
docker compose ps
