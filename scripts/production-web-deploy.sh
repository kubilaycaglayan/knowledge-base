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

# Tag images with the commit they were built from, so the running containers
# name their build and earlier builds stay available. Uncommitted changes get a
# timestamped -dirty tag instead of reusing the commit's tag.
image_tag="$(git rev-parse --short=12 HEAD)"
if [[ -n "$(git status --porcelain)" ]]; then
  image_tag="${image_tag}-dirty-$(date -u +%Y%m%d%H%M%S)"
fi
export KNOWLEDGE_BASE_IMAGE_TAG="$image_tag"
echo "Production image tag: ${image_tag}"

docker volume inspect knowledge-base_know-db >/dev/null 2>&1 || {
  echo 'Refusing production deployment: protected database volume knowledge-base_know-db does not exist.' >&2
  exit 1
}

echo 'Running Knowledge Base production preflight...'
echo "Production host ports: API=${API_PROD_PORT}, PostgreSQL=${DB_PROD_PORT}, proxy=${PROXY_PROD_PORT} (proxy binding removed by Cloudflare overlay)"
./deployment/preflight.sh

build_args=()
if [[ "${PULL_BASE_IMAGES:-0}" == "1" ]]; then
  build_args+=(--pull)
  echo 'Building production images with refreshed base images...'
else
  echo 'Building production images using cached base images (set PULL_BASE_IMAGES=1 to refresh)...'
fi
docker compose "${compose_args[@]}" build "${build_args[@]}"
for image in knowledge-base-api knowledge-base-web; do
  docker tag "$image:$image_tag" "$image:latest"
done

echo 'Updating the production stack (persistent volumes are preserved)...'
# Keep the database stable across application deployments. The backup service
# is recreated deliberately so changed backup and backup database environment
# values are applied, without asking Compose to restart its database dependency.
docker compose "${compose_args[@]}" up -d --no-recreate db
docker compose "${compose_args[@]}" up -d --force-recreate --no-deps backup
docker compose "${compose_args[@]}" up -d --force-recreate --no-deps api web proxy cloudflared

api_container="$(docker compose "${compose_args[@]}" ps -q api)"
proxy_container="$(docker compose "${compose_args[@]}" ps -q proxy)"
tunnel_container="$(docker compose "${compose_args[@]}" ps -q cloudflared)"
for attempt in {1..30}; do
  api_health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' "$api_container" 2>/dev/null || true)"
  proxy_health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' "$proxy_container" 2>/dev/null || true)"
  tunnel_status="$(docker inspect -f '{{.State.Status}}' "$tunnel_container" 2>/dev/null || true)"
  if [[ "$api_health" == healthy && "$proxy_health" == healthy && "$tunnel_status" == running ]]; then
    break
  fi
  sleep 2
done

if [[ "$api_health" != healthy || "$proxy_health" != healthy || "$tunnel_status" != running ]]; then
  echo "Production health check failed: api=$api_health proxy=$proxy_health cloudflared=$tunnel_status" >&2
  docker compose "${compose_args[@]}" ps
  exit 1
fi

echo 'Removing old production image builds...'
./scripts/prune-production-images.sh || echo 'Warning: old production images were not pruned.' >&2
docker compose "${compose_args[@]}" ps
echo 'Knowledge Base production deployment completed.'
