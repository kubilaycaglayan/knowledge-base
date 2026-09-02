#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

production_env_file="$repo_root/.env.production"
if [[ ! -f "$production_env_file" ]]; then
  echo "Missing $production_env_file. Copy .env.example to .env.production and set production values." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$production_env_file"
set +a

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-knowledge-base}"
compose_files=(-f docker-compose.yml -f docker-compose.production.yml -f docker-compose.cloudflare.yml)

docker volume inspect knowledge-base_know-db >/dev/null 2>&1 || {
  echo 'Refusing production rebuild: protected database volume knowledge-base_know-db does not exist.' >&2
  exit 1
}

echo "Stopping the production-shaped stack (database volume is preserved)..."
docker compose "${compose_files[@]}" down

echo "Rebuilding all production-shaped images without cache..."
docker compose "${compose_files[@]}" build --pull --no-cache

echo "Starting the rebuilt stack..."
docker compose "${compose_files[@]}" up -d
docker compose "${compose_files[@]}" ps
