#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-knowledge-base}"
compose_files=(-f docker-compose.yml -f docker-compose.production.yml -f docker-compose.cloudflare.yml)

docker volume inspect knowledge-base_know-db >/dev/null 2>&1 || {
  echo 'Refusing production deployment: protected database volume knowledge-base_know-db does not exist.' >&2
  exit 1
}

echo 'Running Knowledge Base production preflight...'
./deployment/preflight.sh

echo 'Building production images...'
docker compose "${compose_files[@]}" build --pull

echo 'Updating the production stack (persistent volumes are preserved)...'
docker compose "${compose_files[@]}" up -d

for attempt in {1..30}; do
  api_health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' knowledge-base-api-1 2>/dev/null || true)"
  proxy_health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' knowledge-base-proxy-1 2>/dev/null || true)"
  tunnel_status="$(docker inspect -f '{{.State.Status}}' knowledge-base-cloudflared-1 2>/dev/null || true)"
  if [[ "$api_health" == healthy && "$proxy_health" == healthy && "$tunnel_status" == running ]]; then
    break
  fi
  sleep 2
done

if [[ "$api_health" != healthy || "$proxy_health" != healthy || "$tunnel_status" != running ]]; then
  echo "Production health check failed: api=$api_health proxy=$proxy_health cloudflared=$tunnel_status" >&2
  docker compose "${compose_files[@]}" ps
  exit 1
fi

docker compose "${compose_files[@]}" ps
echo 'Knowledge Base production deployment completed.'
