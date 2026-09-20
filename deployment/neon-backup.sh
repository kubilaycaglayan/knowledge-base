#!/bin/sh
set -eu

# Refresh the explicitly designated Neon backup database from the authoritative
# Docker PostgreSQL database. This script deliberately does not use the pooled
# Neon endpoint: pg_dump/pg_restore and Flyway need a direct session.

backup_dir="${BACKUP_DIR:-/backups}"
status_file="${NEON_STATUS_FILE:-$backup_dir/neon-backup-status.env}"
lock_dir="${NEON_LOCK_DIR:-$backup_dir/.neon-backup.lock}"
dump_file="$backup_dir/.knowledge-base-neon-$$.dump"
source_manifest="$backup_dir/.knowledge-base-neon-source-$$.manifest"
target_manifest="$backup_dir/.knowledge-base-neon-target-$$.manifest"
sql_file="$backup_dir/.knowledge-base-neon-$$.sql"
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
  echo 'Neon backup skipped: another snapshot is already running.' >&2
  exit 0
fi

if [ -z "${NEON_DATABASE_URL:-}" ] || [ "${NEON_BACKUP_DATABASE_CONFIRM:-}" != "1" ]; then
  echo 'Neon backup failed: the target must be explicitly confirmed as the backup database.' >&2
  write_status failed 0 0 unavailable
  exit 1
fi

case "$NEON_DATABASE_URL" in
  postgresql://*|postgres://*) ;;
  *) echo 'Neon backup failed: NEON_DATABASE_URL must be a PostgreSQL URL.' >&2; exit 1 ;;
esac

if [ -n "${NEON_DATABASE_URL_POOLED:-}" ]; then
  if ! psql "$NEON_DATABASE_URL_POOLED" -X -v ON_ERROR_STOP=1 -Atc 'SELECT 1;' >/dev/null; then
    echo 'Neon pooled connectivity check failed; continuing with the required direct endpoint.' >&2
  fi
fi

target_database="${NEON_DATABASE_URL#*://}"
target_database="${target_database##*/}"
target_database="${target_database%%\?*}"
if [ -z "$target_database" ]; then
  echo 'Neon backup failed: NEON_DATABASE_URL must include a database name.' >&2
  write_status failed 0 0 unavailable
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1 || ! command -v pg_restore >/dev/null 2>&1 ||
  ! command -v psql >/dev/null 2>&1; then
  echo 'Neon backup failed: PostgreSQL client tools are required.' >&2
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
echo 'Restoring the verified snapshot into the confirmed Neon backup database…'
pg_restore --exit-on-error --clean --if-exists --no-owner --no-acl \
  --dbname="$NEON_DATABASE_URL" "$dump_file"

manifest "$NEON_DATABASE_URL" "$target_manifest"
if ! cmp -s "$source_manifest" "$target_manifest"; then
  echo 'Neon backup failed: source and target table row checksums do not match.' >&2
  write_status failed "$(( $(date +%s) - started_epoch ))" "$dump_size" "$dump_checksum"
  exit 1
fi

# The backup target is validated against Flyway's history table. If the Flyway
# CLI is installed in a maintenance image, run its full validator as well.
if command -v flyway >/dev/null 2>&1; then
  flyway -url="$NEON_DATABASE_URL" validate >/dev/null
else
  migration_count="$(psql "$NEON_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc \
    "SELECT count(*) FROM flyway_schema_history;")"
  [ "$migration_count" -gt 0 ] || {
    echo 'Neon backup failed: Flyway history is empty.' >&2
    write_status failed "$(( $(date +%s) - started_epoch ))" "$dump_size" "$dump_checksum"
    exit 1
  }
fi

write_status success "$(( $(date +%s) - started_epoch ))" "$dump_size" "$dump_checksum"
echo "Neon backup completed: ${dump_size} bytes, sha256=${dump_checksum}"
