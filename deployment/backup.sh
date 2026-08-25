#!/usr/bin/env bash
set -euo pipefail
umask 077

output="${1:-know-backup-$(date -u +%Y-%m-%dT%H-%M-%SZ).sql}"
if [[ -e "$output" ]]; then
  printf 'Refusing to overwrite existing backup: %s\n' "$output" >&2
  exit 1
fi

docker compose exec -T db pg_dump \
  -U "${POSTGRES_USER:-know}" \
  "${POSTGRES_DB:-know}" > "$output"
printf 'Wrote backup to %s\n' "$output"
