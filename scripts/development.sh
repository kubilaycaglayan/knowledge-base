#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export JWT_SECRET="${JWT_SECRET:-development-jwt-secret-at-least-32-chars-long}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-dev-postgres-password}"
if [[ -n "${CHROME_EXTENSION_ID:-}" && -z "${CORS_ORIGINS:-}" ]]; then
  export CORS_ORIGINS="http://localhost:5177,chrome-extension://${CHROME_EXTENSION_ID}"
fi

cd "$repo_root"

docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps
echo
echo "Compose service/image names:"
docker compose -f docker-compose.yml -f docker-compose.dev.yml images
echo
echo "Useful logs:"
echo "  docker compose -f docker-compose.yml -f docker-compose.dev.yml logs --tail 1000 api"
echo "  docker compose -f docker-compose.yml -f docker-compose.dev.yml logs --tail 1000 web"
echo "  docker compose -f docker-compose.yml -f docker-compose.dev.yml logs --tail 1000 proxy"

cat <<'EOF'

Know development stack is available at:
  Web: http://localhost:3000 (Vite hot reload)
  API: http://localhost:3000/api/v1
  Health: http://localhost:8080/actuator/health

Backend changes are picked up automatically by Spring DevTools.
EOF

if [[ ! -d "$repo_root/chrome-extension/node_modules" ]]; then
  (cd "$repo_root/chrome-extension" && npm ci)
fi

wxt_log="$repo_root/chrome-extension/.wxt-dev.log"
wxt_pid_file="$repo_root/chrome-extension/.wxt-dev.pid"
wxt_port=43127
if [[ -f "$wxt_pid_file" ]] && kill -0 "$(<"$wxt_pid_file")" 2>/dev/null; then
  printf 'WXT: status=running port=%s pid=%s log=%s\n' "$wxt_port" "$(<"$wxt_pid_file")" "$wxt_log"
else
  : > "$wxt_log"
  (cd "$repo_root/chrome-extension" && nohup npm run dev -- --host 0.0.0.0 --port "$wxt_port" >"$wxt_log" 2>&1 < /dev/null & echo $! >"$wxt_pid_file")
  wxt_status=starting
  for _ in {1..20}; do
    if ! kill -0 "$(<"$wxt_pid_file")" 2>/dev/null; then
      wxt_status=failed
      break
    fi
    if rg -q 'Started dev server @' "$wxt_log"; then
      wxt_status=running
      break
    fi
    sleep 0.25
  done
  printf 'WXT: status=%s port=%s pid=%s log=%s\n' "$wxt_status" "$(<"$wxt_pid_file")" "$wxt_log"
fi
