#!/usr/bin/env bash
set -euo pipefail

# Search/deep-link acceptance against an isolated disposable stack.
project="knowledge-base-search-smoke-${BASHPID:-$$}-$(date +%s%N)"
started_at="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
password="Search-e2e-$(date +%s%N)"
email="search-e2e-$(date +%s%N)@example.com"
port="${SEARCH_E2E_PROXY_PORT:-26280}"
compose=(docker compose -p "$project" -f docker-compose.yml -f docker-compose.smoke.yml)
cleanup() {
  local status=$?
  if (( status != 0 )); then
    mkdir -p harden-tests/artifacts
    "${compose[@]}" logs --no-color > "harden-tests/artifacts/${project}-server.log" 2>&1 || true
  fi
  "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  echo "Search E2E finished at: $(date -u '+%Y-%m-%d %H:%M:%S UTC') (exit $status)"
}
trap cleanup EXIT
echo "Search E2E disposable Compose project: $project"
echo "Search E2E started at: $started_at"

export COMPOSE_PROJECT_NAME="$project"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$password}"
export JWT_SECRET="${JWT_SECRET:-search-e2e-jwt-secret-$(date +%s%N)}"
export PROXY_HTTP_PORT="$port"
"${compose[@]}" up -d --build db api web proxy >/dev/null
for attempt in {1..60}; do
  if curl -fsS --connect-timeout 2 --max-time 5 "http://localhost:${port}/" | grep -q 'id="app"'; then break; fi
  if [[ "$attempt" == 60 ]]; then echo "Search E2E stack did not become ready" >&2; exit 1; fi
  sleep 2
done
for attempt in {1..60}; do
  api_status="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 2 --max-time 5 "http://localhost:${port}/api/v1/auth/me" || true)"
  if [[ "$api_status" == "401" || "$api_status" == "405" ]]; then break; fi
  if [[ "$attempt" == 60 ]]; then echo "Search E2E API did not become ready (last status: ${api_status:-none})" >&2; exit 1; fi
  sleep 2
done

mkdir -p harden-tests/artifacts
SEARCH_E2E_BASE_URL="http://localhost:${port}" SEARCH_E2E_EMAIL="$email" SEARCH_E2E_PASSWORD="$password" \
  npm run test:search:e2e --prefix frontend 2>&1 | tee "harden-tests/artifacts/${project}-command.log"
