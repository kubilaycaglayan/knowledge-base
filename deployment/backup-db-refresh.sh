#!/bin/sh
set -eu

# Refresh the explicitly designated remote backup database (currently Neon)
# from the authoritative Docker PostgreSQL database. This script deliberately
# does not use a pooled endpoint: pg_dump/pg_restore and Flyway need a direct
# session.

backup_dir="${BACKUP_DIR:-/backups}"
status_file="${BACKUP_DB_STATUS_FILE:-$backup_dir/backup-db-status.env}"
lock_dir="${BACKUP_DB_LOCK_DIR:-$backup_dir/.backup-db-refresh.lock}"
dump_file="$backup_dir/.knowledge-base-backup-db-$$.dump"
source_manifest="$backup_dir/.knowledge-base-backup-db-source-$$.manifest"
target_manifest="$backup_dir/.knowledge-base-backup-db-target-$$.manifest"
sql_file="$backup_dir/.knowledge-base-backup-db-$$.sql"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
started_epoch="$(date +%s)"

mkdir -p "$backup_dir"
umask 077

write_status() {
  result="$1"
  duration="$2"
  size="$3"
  checksum="$4"
  temporary_status="$status_file.$$"
  {
    printf 'status=%s\n' "$result"
    printf 'started_at=%s\n' "$started_at"
    printf 'completed_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'duration_seconds=%s\n' "$duration"
    printf 'dump_size_bytes=%s\n' "$size"
    printf 'dump_sha256=%s\n' "$checksum"
  } > "$temporary_status"
  chmod 600 "$temporary_status"
  mv "$temporary_status" "$status_file"
}

cleanup() {
  rm -f "$dump_file" "$source_manifest" "$target_manifest" "$sql_file"
  rmdir "$lock_dir" 2>/dev/null || true
}
trap cleanup EXIT

if ! mkdir "$lock_dir" 2>/dev/null; then
  echo 'Backup database refresh skipped: another snapshot is already running.' >&2
  exit 0
fi

if [ -z "${BACKUP_DB_URL:-}" ] || [ "${BACKUP_DB_CONFIRM:-}" != "1" ]; then
  echo 'Backup database refresh failed: the target must be explicitly confirmed as the backup database.' >&2
  write_status failed 0 0 unavailable
  exit 1
fi

case "$BACKUP_DB_URL" in
  postgresql://*|postgres://*) ;;
  *) echo 'Backup database refresh failed: BACKUP_DB_URL must be a PostgreSQL URL.' >&2; exit 1 ;;
esac

if [ -n "${BACKUP_DB_URL_POOLED:-}" ]; then
  if ! psql "$BACKUP_DB_URL_POOLED" -X -v ON_ERROR_STOP=1 -Atc 'SELECT 1;' >/dev/null; then
    echo 'Backup database pooled connectivity check failed; continuing with the required direct endpoint.' >&2
  fi
fi

target_database="${BACKUP_DB_URL#*://}"
target_database="${target_database##*/}"
target_database="${target_database%%\?*}"
if [ -z "$target_database" ]; then
  echo 'Backup database refresh failed: BACKUP_DB_URL must include a database name.' >&2
  write_status failed 0 0 unavailable
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1 || ! command -v pg_restore >/dev/null 2>&1 ||
  ! command -v psql >/dev/null 2>&1; then
  echo 'Backup database refresh failed: PostgreSQL client tools are required.' >&2
  write_status failed 0 0 unavailable
  exit 1
fi

manifest() {
  database_url="$1"
  output="$2"
  : > "$sql_file"
  psql "$database_url" -X -v ON_ERROR_STOP=1 -Atc \
    "SELECT format('SELECT %L, count(*), md5(coalesce(string_agg(md5(row_to_json(t)::text), '''' ORDER BY row_to_json(t)::text), '''')) FROM %I.%I t;', table_schema || '.' || table_name, table_schema, table_name) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_schema, table_name;" \
    > "$sql_file"
  psql "$database_url" -X -v ON_ERROR_STOP=1 -Atf "$sql_file" | sort > "$output"
}

echo 'Creating a custom-format snapshot of the Docker PostgreSQL database…'
pg_dump --format=custom --file="$dump_file"
pg_restore --list "$dump_file" >/dev/null
manifest "${PGDATABASE:-${POSTGRES_DB:-know}}" "$source_manifest"

dump_size="$(wc -c < "$dump_file" | tr -d ' ')"
dump_checksum="$(sha256sum "$dump_file" | awk '{print $1}')"
echo 'Restoring the verified snapshot into the confirmed backup database…'
pg_restore --exit-on-error --clean --if-exists --no-owner --no-acl \
  --dbname="$BACKUP_DB_URL" "$dump_file"

manifest "$BACKUP_DB_URL" "$target_manifest"
if ! cmp -s "$source_manifest" "$target_manifest"; then
  echo 'Backup database refresh failed: source and target table row checksums do not match.' >&2
  write_status failed "$(( $(date +%s) - started_epoch ))" "$dump_size" "$dump_checksum"
  exit 1
fi

# The backup target is validated against Flyway's history table. If the Flyway
# CLI is installed in a maintenance image, run its full validator as well.
if command -v flyway >/dev/null 2>&1; then
  flyway -url="$BACKUP_DB_URL" validate >/dev/null
else
  migration_count="$(psql "$BACKUP_DB_URL" -X -v ON_ERROR_STOP=1 -Atc \
    "SELECT count(*) FROM flyway_schema_history;")"
  [ "$migration_count" -gt 0 ] || {
    echo 'Backup database refresh failed: Flyway history is empty.' >&2
    write_status failed "$(( $(date +%s) - started_epoch ))" "$dump_size" "$dump_checksum"
    exit 1
  }
fi

write_status success "$(( $(date +%s) - started_epoch ))" "$dump_size" "$dump_checksum"
echo "Backup database refresh completed: ${dump_size} bytes, sha256=${dump_checksum}"
