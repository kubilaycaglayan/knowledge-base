#!/usr/bin/env bash
set -euo pipefail

# Disposable real-stack board acceptance runner. It never targets the
# persistent development project and removes only this generated Compose
# project's containers and volumes on exit.
project="knowledge-base-board-smoke-${BASHPID:-$$}-$(date +%s%N)"
password="Board-e2e-$(date +%s%N)"
email="board-e2e-$(date +%s%N)@example.com"
# Uncommon, unassigned host port, distinct from the smoke stack's 26080 so both
# disposable stacks can run at the same time without colliding.
port="${BOARD_E2E_PROXY_PORT:-26180}"
compose=(docker compose -p "$project" -f docker-compose.yml -f docker-compose.smoke.yml)
cleanup() { "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

export COMPOSE_PROJECT_NAME="$project"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$password}"
export JWT_SECRET="${JWT_SECRET:-board-e2e-jwt-secret-$(date +%s%N)}"
export PROXY_HTTP_PORT="$port"
"${compose[@]}" up -d --build db api web proxy >/dev/null
for attempt in {1..60}; do
  if curl -fsS --connect-timeout 2 --max-time 5 "http://localhost:${port}/" | grep -q 'id="app"'; then
    break
  fi
  if [[ "$attempt" == 60 ]]; then
    echo "Board E2E stack did not become ready" >&2
    exit 1
  fi
  sleep 2
done
for attempt in {1..60}; do
  api_status="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 2 --max-time 5 "http://localhost:${port}/api/v1/auth/me" || true)"
  if [[ "$api_status" == "401" || "$api_status" == "405" ]]; then
    break
  fi
  if [[ "$attempt" == 60 ]]; then
    echo "Board E2E API did not become ready (last status: ${api_status:-none})" >&2
    exit 1
  fi
  sleep 2
done

BOARD_E2E_BASE_URL="http://localhost:${port}" BOARD_E2E_EMAIL="$email" BOARD_E2E_PASSWORD="$password" \
  npm run test:board:e2e --prefix frontend
