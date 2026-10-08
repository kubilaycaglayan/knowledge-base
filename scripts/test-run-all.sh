#!/usr/bin/env bash
set -uo pipefail

# Runs every automated test and check that can run on Linux. By default every
# step runs even after a failure, so the summary shows the full picture; the
# exit code is non-zero if any step failed. The Docker-stack stage (full-stack
# smoke and the real-stack browser tests) takes most of the time.
#
# Repeat runs reuse caches: the test images are built once per run with
# Docker's normal builder (layer cache in the Docker engine; reclaim it with
# `docker builder prune`) and shared by the smoke and browser stages; Gradle's
# dependency and project caches live in the knowledge-base-test-gradle volume;
# npm ci is skipped while package-lock.json and the Node.js version are
# unchanged. CI always builds and installs clean.
#
#   ./scripts/test-run-all.sh              # everything
#   ./scripts/test-run-all.sh --quick      # no disposable Docker stacks
#   ./scripts/test-run-all.sh --fail-fast  # stop at the first failing step
#
# Options can be combined. iOS tests need macOS and Xcode and are not run here
# (see docs/testing.md).
# Everything runs inside main so bash parses the whole file before starting;
# editing this script (or pulling) during a run cannot break that run.
main() {
  quick=0
  fail_fast=0
  for arg in "$@"; do
    case "$arg" in
      --quick) quick=1 ;;
      --fail-fast) fail_fast=1 ;;
      *)
        echo "Usage: $0 [--quick] [--fail-fast]" >&2
        exit 2
        ;;
    esac
  done

  cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
  # Throwaway secrets for the disposable stacks; never production values.
  export JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
  export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-local-$(openssl rand -hex 8)}"

  # Each step's output streams to the terminal as it runs; every step is timed
  # and a summary table prints at the end, also when the run is interrupted.
  started=$SECONDS
  step_names=()
  step_seconds=()
  step_results=()
  failures=0
  current_step=""
  current_started=0
  duration() { printf '%dm%02ds' $(( $1 / 60 )) $(( $1 % 60 )); }
  record() {
    step_names+=("$current_step")
    step_seconds+=($(( SECONDS - current_started )))
    step_results+=("$1")
    current_step=""
  }
  summary() {
    stop_test_stack >/dev/null 2>&1
    # A step still marked as current was interrupted (for example by Ctrl-C).
    if [[ -n "$current_step" ]]; then
      record "STOPPED"
      failures=$(( failures + 1 ))
    fi
    printf '\n%-64s %-8s %s\n' "Step" "Result" "Time"
    printf '%.0s-' {1..84}
    printf '\n'
    for index in "${!step_names[@]}"; do
      printf '%-64s %-8s %s\n' "${step_names[$index]}" "${step_results[$index]}" \
        "$(duration "${step_seconds[$index]}")"
    done
    printf '%.0s-' {1..84}
    printf '\n%-64s %-8s %s\n' "Total" "$( (( failures == 0 )) && echo PASSED || echo FAILED)" \
      "$(duration $(( SECONDS - started )))"
    if (( failures )); then
      echo "${failures} step(s) failed; scroll up to each step's '==>' header for its output."
    fi
    if (( quick )); then
      echo "(quick: disposable Docker stacks skipped)"
    fi
  }
  trap summary EXIT
  trap 'exit 130' INT TERM
  run_step() {
    current_step="$1"
    current_started=$SECONDS
    printf '\n==> %s\n' "$1"
    shift
    if "$@"; then
      printf '==> %s passed in %s\n' "$current_step" "$(duration $(( SECONDS - current_started )))"
      record "passed"
    else
      local status=$?
      printf '==> %s FAILED (exit %s) after %s\n' "$current_step" "$status" \
        "$(duration $(( SECONDS - current_started )))" >&2
      record "FAILED"
      failures=$(( failures + 1 ))
      if (( fail_fast )); then
        exit "$status"
      fi
      return "$status"
    fi
  }
  skip_step() {
    current_step="$1"
    current_started=$SECONDS
    printf '\n==> %s skipped: %s\n' "$1" "$2"
    record "skipped"
  }

  # npm ci only when the lockfile or Node.js version changed since the last
  # install this script made in that directory.
  npm_install() {
    local dir="$1" stamp="$1/node_modules/.test-run-all-install" fingerprint
    fingerprint="$(node --version) $(sha256sum "$dir/package-lock.json" | cut -d' ' -f1)"
    if [[ -f "$stamp" && "$(cat "$stamp")" == "$fingerprint" ]]; then
      echo "${dir}: package-lock.json and Node.js unchanged since the last install; skipping npm ci"
      return 0
    fi
    (cd "$dir" && npm ci) && echo "$fingerprint" > "$stamp"
  }
  web_tests() {
    npm_install frontend &&
      (cd frontend && npm test && npm run build && npm run test:tracker && npm run test:board && npm run test:nav)
  }
  extension_tests() {
    node --check chrome-extension/popup.js &&
      node --check chrome-extension/options.js &&
      npm_install chrome-extension &&
      (cd chrome-extension && npm test)
  }

  # Gradle's dependency and project caches live in a volume used only by this
  # script (never the development container's), so unchanged sources are not
  # recompiled; --rerun still executes every test.
  run_step "Backend unit and integration tests" \
    docker run --rm -v "$PWD/backend:/app" -w /app \
    -e GRADLE_USER_HOME=/gradle-home -v knowledge-base-test-gradle:/gradle-home \
    gradle:8.13-jdk21 gradle test --rerun --no-daemon \
    --project-cache-dir /gradle-home/project-cache-test-run-all

  run_step "Web unit tests, build, and mocked browser acceptance" web_tests

  run_step "Chrome extension tests" extension_tests

  run_step "Contract checks" \
    bash -c 'node scripts/check-accessibility.mjs && node scripts/check-security.mjs && node scripts/check-smoke-cleanup.mjs && ./scripts/check-image-prune.sh'

  run_step "Shell script syntax" \
    bash -c 'bash -n scripts/*.sh deployment/backup.sh deployment/preflight.sh && sh -n deployment/backup-loop.sh deployment/backup-db-refresh.sh'

  # One container validates every config: container start-up, not Caddy, is
  # the slow part on this host.
  validate_proxy_configs() {
    docker run --rm -e DOMAIN=localhost \
      -v "$PWD/deployment/Caddyfile:/configs/deployment/Caddyfile:ro" \
      -v "$PWD/deployment/Caddyfile.cloudflare:/configs/deployment/Caddyfile.cloudflare:ro" \
      -v "$PWD/frontend/Caddyfile:/configs/frontend/Caddyfile:ro" \
      caddy:2-alpine sh -c '
        invalid=0
        for config in deployment/Caddyfile deployment/Caddyfile.cloudflare frontend/Caddyfile; do
          echo "Validating ${config}"
          caddy validate --adapter caddyfile --config "/configs/${config}" || invalid=1
        done
        exit "$invalid"'
  }
  run_step "Proxy configs" validate_proxy_configs

  # Disposable Docker stacks. The test-only images are built once from this
  # tree; the full-stack smoke starts a stack with both the local and the
  # production (Cloudflare) proxy configs, and the browser suites run against
  # that same stack before it is removed.
  test_compose=(docker compose -f docker-compose.yml -f docker-compose.smoke.yml)
  stack_project="knowledge-base-full-smoke-$$"
  stack_proxy_port=26080
  stack_cloudflare_port=26090
  stack_created=0
  stack_compose() {
    COMPOSE_PROJECT_NAME="$stack_project" "${test_compose[@]}" "$@"
  }
  stack_ready() {
    local attempt api_status
    for attempt in {1..90}; do
      api_status="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 2 --max-time 5 \
        "http://localhost:${stack_proxy_port}/api/v1/auth/me" || true)"
      if [[ "$api_status" == 401 ]] &&
        curl -fsS --max-time 5 "http://localhost:${stack_proxy_port}/" | grep -q 'id="app"' &&
        curl -fsS --max-time 5 "http://localhost:${stack_cloudflare_port}/" | grep -q 'id="app"'; then
        return 0
      fi
      sleep 2
    done
    echo "The test stack is not serving (last API status: ${api_status:-none})" >&2
    return 1
  }
  stop_test_stack() {
    (( stack_created )) || return 0
    stack_created=0
    stack_compose down --volumes --remove-orphans --rmi local
  }
  # Board flows through the local proxy config (as scripts/run-board-e2e.sh).
  board_browser_tests() {
    BOARD_E2E_BASE_URL="http://localhost:${stack_proxy_port}" \
      BOARD_E2E_EMAIL="board-e2e-$(date +%s%N)@example.com" \
      BOARD_E2E_PASSWORD="Board-e2e-$(date +%s%N)" npm run test:board:e2e --prefix frontend
  }
  # Note and card line history through the local proxy config (as
  # scripts/run-line-history-e2e.sh).
  line_history_browser_tests() {
    LINE_HISTORY_E2E_BASE_URL="http://localhost:${stack_proxy_port}" \
      LINE_HISTORY_E2E_EMAIL="lines-e2e-$(date +%s%N)@example.com" \
      LINE_HISTORY_E2E_PASSWORD="Lines-e2e-$(date +%s%N)" npm run test:lines:e2e --prefix frontend
  }
  # Timer sync through the production proxy config (as
  # scripts/run-timer-websocket-e2e.sh).
  timer_browser_tests() {
    node scripts/check-timer-websocket.mjs "http://localhost:${stack_cloudflare_port}" --round-trip &&
      TIMER_E2E_BASE_URL="http://localhost:${stack_cloudflare_port}" npm run test:timer:e2e --prefix frontend
  }
  search_browser_tests() {
    SEARCH_E2E_BASE_URL="http://localhost:${stack_proxy_port}" \
      SEARCH_E2E_EMAIL="search-e2e-$(date +%s%N)@example.com" \
      SEARCH_E2E_PASSWORD="Search-e2e-$(date +%s%N)" npm run test:search:e2e --prefix frontend
  }

  if (( quick == 0 )); then
    smoke_step="Full-stack smoke test (proxies, timer WebSocket, backup/restore)"
    browser_steps=("Board real-stack browser tests" "Timer WebSocket real-stack browser tests" "Line history real-stack browser tests" "Search/deep-link real-stack browser tests")
    if run_step "Build test images" \
      env COMPOSE_PROJECT_NAME=knowledge-base-test-images "${test_compose[@]}" build api web; then
      stack_created=1
      # The full-stack smoke covers everything the API-only smoke does, and more.
      run_step "$smoke_step" env SMOKE_SKIP_BUILD=1 SMOKE_KEEP_STACK=1 SMOKE_FULL_STACK=1 \
        SMOKE_BACKUP_RESTORE=1 PROXY_HTTP_PORT="$stack_proxy_port" \
        PROXY_CLOUDFLARE_PORT="$stack_cloudflare_port" COMPOSE_PROJECT_NAME="$stack_project" \
        ./scripts/run-smoke-tests.sh
      if stack_ready; then
        run_step "${browser_steps[0]}" board_browser_tests
        run_step "${browser_steps[1]}" timer_browser_tests
        run_step "${browser_steps[2]}" line_history_browser_tests
        run_step "${browser_steps[3]}" search_browser_tests
      else
        for name in "${browser_steps[@]}"; do skip_step "$name" "the test stack is not serving"; done
        failures=$(( failures + 1 ))
      fi
      run_step "Remove test stack" stop_test_stack
    else
      for name in "$smoke_step" "${browser_steps[@]}"; do
        skip_step "$name" "the test images did not build"
      done
    fi
  fi

  (( failures == 0 ))
}

# exit on the same line: bash never reads past it, even if the file changed.
main "$@"; exit
