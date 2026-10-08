#!/usr/bin/env bash
set -euo pipefail

# Runs the Orca screen reader against the note editor with line history on, in
# a disposable Compose project and a disposable Orca container, and checks what
# Orca speaks. Requires frontend/node_modules (npm ci) for Playwright.
cd "$(dirname "${BASH_SOURCE[0]}")/.."
project="knowledge-base-orca-smoke-${BASHPID:-$$}-$(date +%s%N)"
port="${ORCA_E2E_PROXY_PORT:-26480}"
out="$(mktemp -d)"
compose=(docker compose -p "$project" -f docker-compose.yml -f docker-compose.smoke.yml)
cleanup() { "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true; rm -rf "$out"; }
trap cleanup EXIT

export COMPOSE_PROJECT_NAME="$project"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-Orca-e2e-$(date +%s%N)}"
export JWT_SECRET="${JWT_SECRET:-orca-e2e-jwt-secret-$(date +%s%N)}"
export PROXY_HTTP_PORT="$port"
"${compose[@]}" up -d --build db api web proxy >/dev/null
docker build -q -t knowledge-base-orca-check scripts/orca >/dev/null
for attempt in {1..90}; do
  api_status="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 2 --max-time 5 "http://localhost:${port}/api/v1/auth/me" || true)"
  [[ "$api_status" == "401" ]] && curl -fsS --connect-timeout 2 --max-time 5 "http://localhost:${port}/" | grep -q 'id="app"' && break
  if [[ "$attempt" == 90 ]]; then echo "Orca E2E stack did not become ready (last API status: ${api_status:-none})" >&2; exit 1; fi
  sleep 2
done

docker run --rm --network host --ipc host \
  -e ORCA_BASE_URL="http://localhost:${port}" -e ORCA_EMAIL="orca-e2e-$(date +%s%N)@example.com" -e ORCA_PASSWORD="Orca-e2e-$(date +%s%N)" \
  -v "$PWD/scripts/orca:/orca:ro" -v "$PWD/frontend:/frontend:ro" -v "$out:/out" \
  knowledge-base-orca-check /orca/run-in-container.sh
echo "Orca said:"; sed 's/^/  /' "$out/speech.txt"
for expected in "^Line 1, edited " "^Line 2, edited " "^Line 3, not saved yet$" "^Line 3, edited "; do
  grep -qE "$expected" "$out/speech.txt" || { echo "Orca never said: $expected" >&2; exit 1; }
done
if grep -qE "[0-9]{2}:[0-9]{2} [0-9]{2}/[0-9]{2}" "$out/speech.txt"; then echo "Orca read gutter stamps aloud" >&2; exit 1; fi
echo "Orca line history check passed"
