#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-try-know-be}"
compose_files=(-f docker-compose.yml -f docker-compose.production.yml)

docker volume inspect try-know-be_know-db >/dev/null 2>&1 || {
  echo 'Refusing production rebuild: protected database volume try-know-be_know-db does not exist.' >&2
  exit 1
}

echo "Stopping the production-shaped stack (database volume is preserved)..."
docker compose "${compose_files[@]}" down

echo "Rebuilding all production-shaped images without cache..."
docker compose "${compose_files[@]}" build --pull --no-cache

echo "Starting the rebuilt stack..."
docker compose "${compose_files[@]}" up -d
docker compose "${compose_files[@]}" ps
