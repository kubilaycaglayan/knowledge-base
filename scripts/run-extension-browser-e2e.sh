#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v xvfb-run >/dev/null 2>&1; then
  echo "xvfb-run is required to launch Chromium with the extension on a headless Linux host" >&2
  exit 1
fi

KNOW_API_BASE="http://127.0.0.1:26580/api/v1" npm run build --prefix chrome-extension
xvfb-run -a npm run test:extension:e2e --prefix frontend
