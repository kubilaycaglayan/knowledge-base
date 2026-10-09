#!/usr/bin/env bash
set -euo pipefail

# Disposable real-stack line history acceptance runner. It never targets the
# persistent development project and removes only this generated Compose
# project's containers and volumes on exit.
cd "$(dirname "${BASH_SOURCE[0]}")/.."
project="knowledge-base-lines-smoke-${BASHPID:-$$}-$(date +%s%N)"
password="Lines-e2e-$(date +%s%N)"
email="lines-e2e-$(date +%s%N)@example.com"
# Uncommon, unassigned host port, distinct from the smoke (26080/26090), board
# E2E (26180), and timer E2E (26290) stacks so they can run at the same time.
port="${LINE_HISTORY_E2E_PROXY_PORT:-26380}"
artifact_dir="${LINE_HISTORY_E2E_ARTIFACT_DIR:-$PWD/harden-tests/local-artifacts/line-history-$(date +%s%N)}"
compose=(docker compose -p "$project" -f docker-compose.yml -f docker-compose.smoke.yml)
cleanup() {
  local exit_status=$?
  trap - EXIT
  if (( exit_status != 0 )); then
    mkdir -p "$artifact_dir"
    printf 'Runner exit status: %s\nCompose project: %s\n' "$exit_status" "$project" > "$artifact_dir/runner-failure.txt"
    "${compose[@]}" ps --all > "$artifact_dir/compose-ps.txt" 2>&1 || true
    "${compose[@]}" logs --no-color > "$artifact_dir/stack.log" 2>&1 || true
  fi
  "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  exit "$exit_status"
}
trap cleanup EXIT

export COMPOSE_PROJECT_NAME="$project"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$password}"
export JWT_SECRET="${JWT_SECRET:-line-history-e2e-jwt-secret-$(date +%s%N)}"
export PROXY_HTTP_PORT="$port"
"${compose[@]}" up -d --build db api web proxy >/dev/null
for attempt in {1..90}; do
  api_status="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 2 --max-time 5 "http://localhost:${port}/api/v1/auth/me" || true)"
  if [[ "$api_status" == "401" ]] && curl -fsS --connect-timeout 2 --max-time 5 "http://localhost:${port}/" | grep -q 'id="app"'; then
    break
  fi
  if [[ "$attempt" == 90 ]]; then
    echo "Line history E2E stack did not become ready (last API status: ${api_status:-none})" >&2
    exit 1
  fi
  sleep 2
done

mkdir -p "$artifact_dir"
printf 'Commit: %s\nBrowser engine: %s\nBrowser profile: %s\n' "$(git rev-parse HEAD)" "${BROWSER_ENGINE:-chromium}" "${BROWSER_PROFILE:-default}" > "$artifact_dir/run-metadata.txt"
test_log="$(mktemp)"
set +e
LINE_HISTORY_E2E_BASE_URL="http://localhost:${port}" LINE_HISTORY_E2E_EMAIL="$email" LINE_HISTORY_E2E_PASSWORD="$password" LINE_HISTORY_E2E_ARTIFACT_DIR="$artifact_dir" \
  npm run test:lines:e2e --prefix frontend > "$test_log" 2>&1
test_status=$?
set -e
cat "$test_log"
if [[ "$test_status" != 0 ]]; then
  mv "$test_log" "$artifact_dir/command.log"
  "${compose[@]}" logs --no-color > "$artifact_dir/stack.log" 2>&1 || true
  exit "$test_status"
fi
rm -f "$test_log"
