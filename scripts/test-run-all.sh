#!/usr/bin/env bash
set -euo pipefail

# Runs every automated test and check that can run on Linux, stopping at the
# first failure. The Docker-stack stage (smoke, full-stack smoke, and the
# real-stack browser tests) takes most of the time; skip it with --quick.
#
#   ./scripts/test-run-all.sh          # everything (~30-45 minutes)
#   ./scripts/test-run-all.sh --quick  # no disposable Docker stacks (~5 minutes)
#
# iOS tests need macOS and Xcode and are not run here (see docs/testing.md).
quick=0
case "${1:-}" in
  "") ;;
  --quick) quick=1 ;;
  *)
    echo "Usage: $0 [--quick]" >&2
    exit 2
    ;;
esac

cd "$(dirname "${BASH_SOURCE[0]}")/.."
# Throwaway secrets for the disposable stacks; never production values.
export JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-local-$(openssl rand -hex 8)}"

# Each step's output streams to the terminal as it runs; every step is timed
# and a summary table prints at the end, including when a step fails.
started=$SECONDS
step_names=()
step_seconds=()
step_results=()
current_step=""
current_started=0
duration() { printf '%dm%02ds' $(( $1 / 60 )) $(( $1 % 60 )); }
summary() {
  local status=$? index
  if [[ -n "$current_step" ]]; then
    step_names+=("$current_step")
    step_seconds+=($(( SECONDS - current_started )))
    step_results+=("FAILED")
  fi
  printf '\n%-64s %-8s %s\n' "Step" "Result" "Time"
  printf '%.0s-' {1..84}
  printf '\n'
  for index in "${!step_names[@]}"; do
    printf '%-64s %-8s %s\n' "${step_names[$index]}" "${step_results[$index]}" \
      "$(duration "${step_seconds[$index]}")"
  done
  printf '%.0s-' {1..84}
  printf '\n%-64s %-8s %s\n' "Total" "$( (( status == 0 )) && echo PASSED || echo FAILED)" \
    "$(duration $(( SECONDS - started )))"
  if (( status == 0 && quick )); then
    echo "(quick: disposable Docker stacks skipped)"
  fi
}
trap summary EXIT
run_step() {
  current_step="$1"
  current_started=$SECONDS
  printf '\n==> %s\n' "$1"
  shift
  "$@"
  step_names+=("$current_step")
  step_seconds+=($(( SECONDS - current_started )))
  step_results+=("passed")
  printf '==> %s passed in %s\n' "$current_step" "$(duration $(( SECONDS - current_started )))"
  current_step=""
}

run_step "Backend unit and integration tests" \
  docker run --rm -v "$PWD/backend:/app" -w /app gradle:8.13-jdk21 gradle test --no-daemon \
  --project-cache-dir "/tmp/knowledge-base-gradle-project-cache-${USER:-agent}-$$"

run_step "Web unit tests, build, and mocked browser acceptance" \
  bash -c 'cd frontend && npm ci && npm test && npm run build && npm run test:tracker && npm run test:board'

run_step "Chrome extension tests" \
  bash -c 'node --check chrome-extension/popup.js && node --check chrome-extension/options.js && cd chrome-extension && npm ci && npm test'

run_step "Contract checks" \
  bash -c 'node scripts/check-accessibility.mjs && node scripts/check-security.mjs && node scripts/check-smoke-cleanup.mjs'

run_step "Shell script syntax" \
  bash -c 'bash -n scripts/*.sh deployment/backup.sh deployment/preflight.sh && sh -n deployment/backup-loop.sh deployment/backup-db-refresh.sh'

validate_proxy_configs() {
  for config in deployment/Caddyfile deployment/Caddyfile.cloudflare frontend/Caddyfile; do
    docker run --rm -e DOMAIN=localhost -v "$PWD/$config:/etc/caddy/Caddyfile:ro" caddy:2-alpine \
      caddy validate --config /etc/caddy/Caddyfile
  done
}
run_step "Proxy configs" validate_proxy_configs

if (( quick == 0 )); then
  run_step "Smoke test" ./scripts/run-smoke-tests.sh
  run_step "Full-stack smoke test (both proxies and the timer WebSocket)" \
    env SMOKE_FULL_STACK=1 COMPOSE_PROJECT_NAME=knowledge-base-full-smoke ./scripts/run-smoke-tests.sh
  run_step "Board real-stack browser tests" ./scripts/run-board-e2e.sh
  run_step "Timer WebSocket real-stack browser tests" ./scripts/run-timer-websocket-e2e.sh
fi
