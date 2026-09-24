#!/usr/bin/env bash
set -euo pipefail
umask 077

# Backs up production. The smoke test sets BACKUP_COMPOSE_PROJECT to its own
# disposable project; COMPOSE_PROJECT_NAME is deliberately ignored so a value
# left in a shell can never redirect a production backup.
project="${BACKUP_COMPOSE_PROJECT:-knowledge-base-production}"
export COMPOSE_PROJECT_NAME="$project"

backup_dir="${BACKUP_DIR:-backups}"
output="${1:-${backup_dir}/knowledge-base-$(date -u +%Y-%m-%dT%H-%M-%SZ).sql}"
output_parent="$(dirname -- "$output")"
mkdir -p -- "$output_parent"
if [[ -e "$output" ]]; then
  printf 'Refusing to overwrite existing backup: %s\n' "$output" >&2
  exit 1
fi

docker compose --project-name "$project" exec -T db pg_dump \
  -U "${POSTGRES_USER:-know}" \
  "${POSTGRES_DB:-know}" > "$output"
printf 'Wrote backup to %s\n' "$output"
