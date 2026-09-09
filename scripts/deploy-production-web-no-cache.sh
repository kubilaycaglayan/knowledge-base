#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

production_env_file="$repo_root/.env.production"
if [[ ! -f "$production_env_file" ]]; then
  echo "⚠️ Missing $production_env_file. Copy .env.example to .env.production and set production values." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$production_env_file"
set +a

export KNOW_API_BASE="${KNOW_API_BASE:-https://${DOMAIN}/api/v1}"

export COMPOSE_PROJECT_NAME="knowledge-base-production"
export DB_PROD_PORT="${DB_PROD_PORT:-15433}"
export API_PROD_PORT="${API_PROD_PORT:-18082}"
export PROXY_PROD_PORT="${PROXY_PROD_PORT:-19080}"
compose_args=(--project-name knowledge-base-production -f docker-compose.yml -f docker-compose.production.yml -f docker-compose.cloudflare.yml)

echo 'Running Knowledge Base production preflight...'
./deployment/preflight.sh
docker volume inspect knowledge-base_know-db >/dev/null 2>&1 || {
  echo 'Refusing production rebuild: protected database volume knowledge-base_know-db does not exist.' >&2
  exit 1
}

echo "Stopping the production-shaped stack (database volume is preserved)..."
echo "Production host ports: API=${API_PROD_PORT}, PostgreSQL=${DB_PROD_PORT}, proxy=${PROXY_PROD_PORT} (proxy binding removed by Cloudflare overlay)"
docker compose "${compose_args[@]}" down

echo "Rebuilding all production-shaped images without cache..."
docker compose "${compose_args[@]}" build --pull --no-cache

echo "Starting the rebuilt stack..."
docker compose "${compose_args[@]}" up -d --force-recreate
docker compose "${compose_args[@]}" ps
