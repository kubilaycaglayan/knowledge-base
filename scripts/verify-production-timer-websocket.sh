#!/usr/bin/env bash
set -euo pipefail

# Post-deploy check that the public timer WebSocket reaches the API through
# Cloudflare and the production proxy. It fails the deployment when /ws/* is
# not routed to the API (clients would silently fall back to polling).
#
# Without credentials it needs no account (see scripts/check-timer-websocket.mjs).
# Set TIMER_WS_EMAIL and TIMER_WS_PASSWORD in .env.production for a dedicated
# probe account to also require live timer snapshots and an idle socket that
# survives TIMER_WS_IDLE_SECONDS (default 110, past Cloudflare's ~100s cutoff).
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
: "${DOMAIN:?Set DOMAIN to the public production domain}"
public_url="https://${DOMAIN}"

echo "Checking the public timer WebSocket at ${public_url}..."
# The tunnel and API may still be settling right after containers are replaced.
for attempt in {1..45}; do
  if node scripts/check-timer-websocket.mjs "$public_url" 2>/dev/null; then
    break
  fi
  if [[ "$attempt" == 45 ]]; then
    node scripts/check-timer-websocket.mjs "$public_url"
    exit 1
  fi
  sleep 4
done

if [[ -n "${TIMER_WS_EMAIL:-}" && -n "${TIMER_WS_PASSWORD:-}" ]]; then
  node scripts/check-timer-websocket.mjs "$public_url" --round-trip \
    "--idle-seconds=${TIMER_WS_IDLE_SECONDS:-110}"
fi
