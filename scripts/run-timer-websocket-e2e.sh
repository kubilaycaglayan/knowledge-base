#!/usr/bin/env bash
set -euo pipefail

# Disposable real-stack timer WebSocket acceptance runner. The browser reaches
# the app through the production proxy config (deployment/Caddyfile.cloudflare),
# so a proxy that stops routing /ws/* to the API fails here before deployment.
# It never targets the persistent development project and removes only this
# generated Compose project's containers and volumes on exit.
cd "$(dirname "${BASH_SOURCE[0]}")/.."
project="knowledge-base-timer-ws-smoke-${BASHPID:-$$}-$(date +%s%N)"
# Uncommon, unassigned host port, distinct from the smoke (26080/26090) and
# board E2E (26180) stacks so they can run at the same time.
port="${TIMER_E2E_PROXY_PORT:-26290}"
artifact_dir="${TIMER_E2E_ARTIFACT_DIR:-$PWD/harden-tests/local-artifacts/timer-ws-$(date +%s%N)}"
compose=(docker compose -p "$project" -f docker-compose.yml -f docker-compose.smoke.yml)
cleanup() { "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

export COMPOSE_PROJECT_NAME="$project"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-Timer-e2e-$(date +%s%N)}"
export JWT_SECRET="${JWT_SECRET:-timer-e2e-jwt-secret-$(date +%s%N)}"
export PROXY_CLOUDFLARE_PORT="$port"
"${compose[@]}" up -d --build db api web proxy-cloudflare >/dev/null
for attempt in {1..90}; do
  api_status="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 2 --max-time 5 "http://localhost:${port}/api/v1/auth/me" || true)"
  if [[ "$api_status" == "401" ]] && curl -fsS --connect-timeout 2 --max-time 5 "http://localhost:${port}/" | grep -q 'id="app"'; then
    break
  fi
  if [[ "$attempt" == 90 ]]; then
    echo "Timer WebSocket E2E stack did not become ready (last API status: ${api_status:-none})" >&2
    exit 1
  fi
  sleep 2
done

node scripts/check-timer-websocket.mjs "http://localhost:${port}" --round-trip
mkdir -p "$artifact_dir"
printf 'Commit: %s\nBrowser engine: %s\nBrowser profile: %s\n' "$(git rev-parse HEAD)" "${BROWSER_ENGINE:-chromium}" "${BROWSER_PROFILE:-default}" > "$artifact_dir/run-metadata.txt"
test_log="$(mktemp)"
set +e
TIMER_E2E_BASE_URL="http://localhost:${port}" TIMER_E2E_ARTIFACT_DIR="$artifact_dir" npm run test:timer:e2e --prefix frontend > "$test_log" 2>&1
test_status=$?
set -e
cat "$test_log"
if [[ "$test_status" != 0 ]]; then
  mv "$test_log" "$artifact_dir/command.log"
  "${compose[@]}" logs --no-color > "$artifact_dir/stack.log" 2>&1 || true
  exit "$test_status"
fi
rm -f "$test_log"
