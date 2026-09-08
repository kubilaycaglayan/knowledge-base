#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

development_env_file="$repo_root/.env.development"
if [[ -f "$development_env_file" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$development_env_file"
  set +a
else
  echo "Warning: $development_env_file not found; using development defaults." >&2
fi

export JWT_SECRET="${JWT_SECRET:-development-jwt-secret-at-least-32-chars-long}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-dev-postgres-password}"
if [[ -n "${CHROME_EXTENSION_ID:-}" ]]; then
  chrome_extension_origin="chrome-extension://${CHROME_EXTENSION_ID}"
  case ",${CORS_ORIGINS:-}," in
    *",${chrome_extension_origin},"*) ;;
    *) export CORS_ORIGINS="${CORS_ORIGINS:+${CORS_ORIGINS},}${chrome_extension_origin}" ;;
  esac
fi

cd "$repo_root"

export COMPOSE_PROJECT_NAME="knowledge-base-dev"
export DB_DEV_PORT="${DB_DEV_PORT:-15432}"
export API_DEV_PORT="${API_DEV_PORT:-8080}"
export PROXY_DEV_PORT="${PROXY_DEV_PORT:-3000}"
compose_args=(--project-name knowledge-base-dev)
if [[ -f "$development_env_file" ]]; then
  compose_args+=(--env-file "$development_env_file")
fi
compose_args+=(-f docker-compose.yml -f docker-compose.dev.yml)

dev_db_volume="knowledge-base-dev_know-db"
if ! docker volume inspect "$dev_db_volume" >/dev/null 2>&1; then
  echo "Refusing to start development: protected database volume $dev_db_volume does not exist." >&2
  echo "Create or restore that volume deliberately before starting development." >&2
  exit 1
fi

# Recreate the API when its environment changes (especially CORS_ORIGINS), and
# the web container so npm ci runs when package.json/package-lock.json changes.
# The named frontend node_modules volume is disposable; the protected
# development database volume is never recreated here.
docker compose "${compose_args[@]}" up -d --force-recreate api web
docker compose "${compose_args[@]}" ps
echo
echo "Development API CORS origins: ${CORS_ORIGINS:-http://localhost:5177}"
echo
echo "Compose service/image names:"
docker compose "${compose_args[@]}" images
echo
echo "Useful logs:"
echo "  docker compose --project-name knowledge-base-dev -f docker-compose.yml -f docker-compose.dev.yml logs --tail 1000 api"
echo "  docker compose --project-name knowledge-base-dev -f docker-compose.yml -f docker-compose.dev.yml logs --tail 1000 web"
echo "  docker compose --project-name knowledge-base-dev -f docker-compose.yml -f docker-compose.dev.yml logs --tail 1000 proxy"

cat <<'EOF'

Knowledge Base development stack is available at:
  Web: http://localhost:3000 (Vite hot reload)
  API via proxy: http://localhost:3000/api/v1
  API health: http://localhost:8080/actuator/health

Backend changes are picked up automatically by Spring DevTools.
EOF

if [[ ! -d "$repo_root/chrome-extension/node_modules" ]]; then
  (cd "$repo_root/chrome-extension" && npm ci)
fi

wxt_log="$repo_root/chrome-extension/.wxt-dev.log"
wxt_pid_file="$repo_root/chrome-extension/.wxt-dev.pid"
wxt_port=43127
is_wxt_process() {
  local pid="$1"
  local command

  command="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  [[ "$command" == *"npm run dev"* || "$command" == *"/node_modules/.bin/wxt"* ]]
}

if [[ -f "$wxt_pid_file" ]]; then
  wxt_pid="$(<"$wxt_pid_file")"

  # Older versions stored the start-development.sh wrapper PID. If it is still
  # alive, adopt its npm child so status output and future checks use the
  # actual WXT process tree.
  if ! is_wxt_process "$wxt_pid"; then
    child_pid="$(pgrep -P "$wxt_pid" -f 'npm run dev' | head -n 1 || true)"
    if [[ -n "$child_pid" ]]; then
      wxt_pid="$child_pid"
      printf '%s\n' "$wxt_pid" >"$wxt_pid_file"
    fi
  fi

  if is_wxt_process "$wxt_pid"; then
    printf 'WXT: status=running port=%s pid=%s log=%s\n' "$wxt_port" "$wxt_pid" "$wxt_log"
  else
    wxt_pid=""
  fi
fi

if [[ -z "${wxt_pid:-}" ]]; then
  : > "$wxt_log"
  (
    cd "$repo_root/chrome-extension"
    nohup npm run dev -- --host 0.0.0.0 --port "$wxt_port" >"$wxt_log" 2>&1 < /dev/null &
    printf '%s\n' "$!" >"$wxt_pid_file"
  )
  wxt_status=starting
  for _ in {1..20}; do
    wxt_pid="$(<"$wxt_pid_file")"
    if ! kill -0 "$wxt_pid" 2>/dev/null; then
      wxt_status=failed
      break
    fi
    if rg -q 'Started dev server @' "$wxt_log"; then
      wxt_status=running
      break
    fi
    sleep 0.25
  done
  printf 'WXT: status=%s port=%s pid=%s log=%s\n' "$wxt_status" "$wxt_port" "$wxt_pid" "$wxt_log"
else
  :
fi
