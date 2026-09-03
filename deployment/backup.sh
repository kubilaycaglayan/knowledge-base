#!/usr/bin/env bash
set -euo pipefail
umask 077

export COMPOSE_PROJECT_NAME="knowledge-base-production"

backup_dir="${BACKUP_DIR:-backups}"
output="${1:-${backup_dir}/knowledge-base-$(date -u +%Y-%m-%dT%H-%M-%SZ).sql}"
output_parent="$(dirname -- "$output")"
mkdir -p -- "$output_parent"
if [[ -e "$output" ]]; then
  printf 'Refusing to overwrite existing backup: %s\n' "$output" >&2
  exit 1
fi

docker compose --project-name knowledge-base-production exec -T db pg_dump \
  -U "${POSTGRES_USER:-know}" \
  "${POSTGRES_DB:-know}" > "$output"
printf 'Wrote backup to %s\n' "$output"
