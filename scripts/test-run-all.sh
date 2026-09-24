#!/usr/bin/env bash
set -uo pipefail

# Runs every automated test and check that can run on Linux. By default every
# step runs even after a failure, so the summary shows the full picture; the
# exit code is non-zero if any step failed. The Docker-stack stage (full-stack
# smoke and the real-stack browser tests) takes most of the time.
#
# Repeat runs reuse caches under ~/.cache/knowledge-base (override with
# TEST_RUN_CACHE_DIR): the smoke image build cache, the backend Gradle
# dependencies, and npm installs, which are skipped while package-lock.json
# and the Node.js version are unchanged. CI always builds and installs clean.
# Delete that directory (and `docker volume rm knowledge-base-test-gradle`) to
# start cold.
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
  cache_dir="${TEST_RUN_CACHE_DIR:-$HOME/.cache/knowledge-base}"
  # run-smoke-tests.sh uses a new Buildx builder per run; this local cache lets
  # it reuse image layers (dependencies) from the previous run.
  export SMOKE_BUILD_CACHE_DIR="${SMOKE_BUILD_CACHE_DIR:-$cache_dir/smoke-build}"
  mkdir -p "$SMOKE_BUILD_CACHE_DIR"

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
    fi
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
      (cd frontend && npm test && npm run build && npm run test:tracker && npm run test:board)
  }
  extension_tests() {
    node --check chrome-extension/popup.js &&
      node --check chrome-extension/options.js &&
      npm_install chrome-extension &&
      (cd chrome-extension && npm test)
  }

  # The Gradle dependency cache lives in a volume used only by this script.
  run_step "Backend unit and integration tests" \
    docker run --rm -v "$PWD/backend:/app" -w /app \
    -e GRADLE_USER_HOME=/gradle-home -v knowledge-base-test-gradle:/gradle-home \
    gradle:8.13-jdk21 gradle test --no-daemon \
    --project-cache-dir "/tmp/knowledge-base-gradle-project-cache-${USER:-agent}-$$"

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

  if (( quick == 0 )); then
    # The full-stack smoke covers everything the API-only smoke does, and more.
    run_step "Full-stack smoke test (both proxies and the timer WebSocket)" \
      env SMOKE_FULL_STACK=1 COMPOSE_PROJECT_NAME=knowledge-base-full-smoke ./scripts/run-smoke-tests.sh
    run_step "Board real-stack browser tests" ./scripts/run-board-e2e.sh
    run_step "Timer WebSocket real-stack browser tests" ./scripts/run-timer-websocket-e2e.sh
  fi

  (( failures == 0 ))
}

# exit on the same line: bash never reads past it, even if the file changed.
main "$@"; exit
