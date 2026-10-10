#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

project="knowledge-base-paths-e2e-${BASHPID:-$$}-$(date +%s%N)"
password="Paths-e2e-$(date +%s%N)"
email="paths-e2e-$(date +%s%N)@example.com"
port="${PATHS_E2E_PROXY_PORT:-26880}"
compose=(docker compose -p "$project" -f docker-compose.yml -f docker-compose.smoke.yml)
cleanup() { "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

export COMPOSE_PROJECT_NAME="$project"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$password}"
export JWT_SECRET="${JWT_SECRET:-paths-e2e-jwt-secret-$(date +%s%N)}"
export PROXY_HTTP_PORT="$port"
"${compose[@]}" up -d --build db api web proxy >/dev/null
for attempt in {1..90}; do
  api_status="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 2 --max-time 5 "http://localhost:${port}/api/v1/auth/me" 2>/dev/null || true)"
  if [[ "$api_status" == "401" ]] && curl -fsS --connect-timeout 2 --max-time 5 "http://localhost:${port}/" | grep -q 'id="app"'; then
    break
  fi
  if [[ "$attempt" == 90 ]]; then
    echo "Paths E2E stack did not become ready (last API status: ${api_status:-none})" >&2
    exit 1
  fi
  sleep 2
done

PATHS_E2E_BASE_URL="http://localhost:${port}" PATHS_E2E_EMAIL="$email" PATHS_E2E_PASSWORD="$password" \
  npm run test:paths:e2e --prefix frontend
