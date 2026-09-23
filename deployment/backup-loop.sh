#!/bin/sh
set -eu

backup_dir="${BACKUP_DIR:-/backups}"
interval_seconds="${BACKUP_INTERVAL_SECONDS:-3600}"
retention_count="${BACKUP_RETENTION_COUNT:-168}"
backup_db_enabled="${BACKUP_DB_ENABLED:-1}"

mkdir -p "$backup_dir"
umask 077

while :; do
  timestamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
  output="$backup_dir/knowledge-base-$timestamp.sql"
  temporary="$output.tmp"

  rm -f "$temporary"
  pg_dump --format=plain --file="$temporary"
  chmod 600 "$temporary"
  mv "$temporary" "$output"
  echo "Wrote backup to $output"

  if [ "$backup_db_enabled" = "1" ]; then
    if ! /usr/local/bin/knowledge-base-backup-db-refresh; then
      # The backup database is a remote copy. A failed refresh must not stop
      # local snapshots or affect application writes.
      echo 'Backup database refresh failed; retaining the completed local snapshot.' >&2
    fi
  fi

  # Keep the newest completed dumps and remove older local snapshots.
  old_backups="$(ls -1t "$backup_dir"/knowledge-base-*.sql 2>/dev/null | tail -n +$((retention_count + 1)) || true)"
  if [ -n "$old_backups" ]; then
    printf '%s\n' "$old_backups" | xargs -r rm -f --
  fi

  sleep "$interval_seconds"
done
