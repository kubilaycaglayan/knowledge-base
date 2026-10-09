#!/usr/bin/env bash
set -euo pipefail

# Disposable real-stack search acceptance runner. It never targets the
# persistent development project and removes only this generated Compose
# project's containers and volumes.
cd "$(dirname "${BASH_SOURCE[0]}")/.."
project="knowledge-base-search-smoke-${BASHPID:-$$}-$(date +%s%N)"
password="Search-e2e-$(date +%s%N)"
port="${SEARCH_E2E_PROXY_PORT:-26480}"
artifact_dir="${SEARCH_E2E_ARTIFACT_DIR:-$PWD/harden-tests/local-artifacts/search-$(date +%s%N)}"
compose=(docker compose -p "$project" -f docker-compose.yml -f docker-compose.smoke.yml)
cleanup() { "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

export COMPOSE_PROJECT_NAME="$project"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$password}"
export JWT_SECRET="${JWT_SECRET:-search-e2e-jwt-secret-$(date +%s%N)}"
export PROXY_HTTP_PORT="$port"
"${compose[@]}" up -d --build db api web proxy >/dev/null
for attempt in {1..90}; do
  api_status="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 2 --max-time 5 "http://localhost:${port}/api/v1/auth/me" || true)"
  if [[ "$api_status" == "401" ]] && curl -fsS --connect-timeout 2 --max-time 5 "http://localhost:${port}/" | grep -q 'id="app"'; then
    break
  fi
  if [[ "$attempt" == 90 ]]; then
    echo "Search E2E stack did not become ready (last API status: ${api_status:-none})" >&2
    exit 1
  fi
  sleep 2
done

mkdir -p "$artifact_dir"
printf 'Commit: %s\nBrowser engine: %s\nBrowser profile: %s\n' "$(git rev-parse HEAD)" "${BROWSER_ENGINE:-chromium}" "${BROWSER_PROFILE:-default}" > "$artifact_dir/run-metadata.txt"
test_log="$(mktemp)"
set +e
SEARCH_E2E_BASE_URL="http://localhost:${port}" SEARCH_E2E_ARTIFACT_DIR="$artifact_dir" npm run test:search:e2e --prefix frontend > "$test_log" 2>&1
test_status=$?
set -e
cat "$test_log"
if [[ "$test_status" != 0 ]]; then
  mv "$test_log" "$artifact_dir/command.log"
  "${compose[@]}" logs --no-color > "$artifact_dir/stack.log" 2>&1 || true
  exit "$test_status"
fi
rm -f "$test_log"
