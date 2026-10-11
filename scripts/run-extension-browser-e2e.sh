#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v xvfb-run >/dev/null 2>&1; then
  echo "xvfb-run is required to launch Chromium with the extension on a headless Linux host" >&2
  exit 1
fi

KNOW_API_BASE="http://127.0.0.1:26580/api/v1" npm run build --prefix chrome-extension
if [[ -n "${OTOTEST_TEST_NAME_PATTERN:-}" ]]; then
  (
    cd frontend
    xvfb-run -a node --test --test-concurrency=1 \
      --test-name-pattern="$OTOTEST_TEST_NAME_PATTERN" \
      scripts/extension.real-browser.acceptance.test.mjs
  )
else
  xvfb-run -a npm run test:extension:e2e --prefix frontend
fi
