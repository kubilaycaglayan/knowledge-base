#!/usr/bin/env bash
set -Eeuo pipefail

# This demo always uses a dedicated Compose project and the smoke overlay. It
# cannot attach to the persistent development or production database volumes.
readonly project=knowledge-base-observability-demo
readonly env_file="${TMPDIR:-/tmp}/${project}.env"
readonly compose_files=(-f docker-compose.yml -f docker-compose.smoke.yml -f docker-compose.observability.yml)

ensure_env() {
  if [[ ! -f "$env_file" ]]; then
    umask 077
    python3 - "$env_file" <<'PY'
import secrets, sys
with open(sys.argv[1], "x", encoding="utf-8") as f:
    f.write("JWT_SECRET=" + secrets.token_urlsafe(48) + "\n")
    f.write("POSTGRES_PASSWORD=" + secrets.token_urlsafe(32) + "\n")
PY
  fi
}

ensure_env
compose() { docker compose -p "$project" --env-file "$env_file" "${compose_files[@]}" "$@"; }

case "${1:-up}" in
  up)
    compose up --build -d db api api-journey telemetry oncall-agent alertmanager
    printf 'Grafana:      http://127.0.0.1:%s (admin / admin)\n' "${OBSERVABILITY_GRAFANA_PORT:-3300}"
    printf 'Alertmanager: http://127.0.0.1:%s\n' "${OBSERVABILITY_ALERTS_PORT:-3301}"
    printf 'Synthetic journey runs every 15 seconds. Stop with: %s down\n' "$0"
    ;;
  status)
    compose ps
    ;;
  logs)
    compose logs -f --tail=100 "${2:-api-journey}"
    ;;
  simulate-failure)
    python3 - "${OBSERVABILITY_PROBE_PORT:-3303}" <<'PY'
import sys
from urllib.request import Request, urlopen
port = sys.argv[1]
req = Request(f'http://127.0.0.1:{port}/simulate-failure', data=b'{}', headers={'Content-Type': 'application/json'}, method='POST')
with urlopen(req, timeout=5) as response:
    print(response.read().decode())
print('The alert should reach the responder after about 20 seconds.')
PY
    ;;
  down)
    # Fixed project name plus dedicated smoke overlay: --volumes removes only
    # this demo's disposable database volume.
    compose down --volumes --remove-orphans
    python3 - "$env_file" <<'PY'
from pathlib import Path
import sys
Path(sys.argv[1]).unlink(missing_ok=True)
PY
    ;;
  *)
    echo "Usage: $0 [up|status|logs [service]|simulate-failure|down]" >&2
    exit 2
    ;;
esac
