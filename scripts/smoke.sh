#!/usr/bin/env bash
set -euo pipefail

: "${JWT_SECRET:?Set JWT_SECRET to a random value before running smoke tests}"
: "${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD to the password used by the database volume}"
if (( ${#JWT_SECRET} < 32 )); then echo "JWT_SECRET must be at least 32 characters" >&2; exit 1; fi
: "${DB_DEV_PORT:=15432}"
: "${API_DEV_PORT:=18081}"
export DB_DEV_PORT API_DEV_PORT
if [[ "${SMOKE_FULL_STACK:-0}" == "1" ]]; then
  : "${PROXY_DEV_PORT:=18000}"
  : "${PROXY_HTTP_PORT:=18080}"
  : "${PROXY_HTTPS_PORT:=18443}"
  export PROXY_DEV_PORT PROXY_HTTP_PORT PROXY_HTTPS_PORT
fi

backup_dir=""
restore_db=""
migration_db=""
buildx_builder=""
cleanup() {
  if [[ -n "$restore_db" ]]; then docker compose exec -T db dropdb --if-exists -U "${POSTGRES_USER:-know}" "$restore_db" >/dev/null 2>&1 || true; fi
  if [[ -n "$migration_db" ]]; then docker compose exec -T db dropdb --if-exists -U "${POSTGRES_USER:-know}" "$migration_db" >/dev/null 2>&1 || true; fi
  docker compose down --volumes --remove-orphans --rmi local >/dev/null 2>&1 || true
  if [[ -n "$buildx_builder" ]]; then docker buildx rm --force "$buildx_builder" >/dev/null 2>&1 || true; fi
  if [[ -n "$backup_dir" && -d "$backup_dir" ]]; then rm -rf "$backup_dir"; fi
}
trap cleanup EXIT

services=(db api)
if [[ "${SMOKE_FULL_STACK:-0}" == "1" ]]; then services+=(web proxy); fi
buildx_builder="know-smoke-${COMPOSE_PROJECT_NAME:-try-know-be}-${BASHPID}-$(date +%s%N)"
if ! docker buildx create --name "$buildx_builder" --driver docker-container >/dev/null 2>&1; then
  echo "Smoke tests require Docker Buildx so their build cache can be cleaned safely" >&2
  exit 1
fi
export BUILDX_BUILDER="$buildx_builder"
docker compose up -d "${services[@]}" --build >/dev/null
for attempt in {1..30}; do
  if docker compose exec -T api wget -qO- http://localhost:8080/actuator/health | grep -q '"status":"UP"'; then break; fi
  if [[ "$attempt" == 30 ]]; then echo "API did not become healthy" >&2; exit 1; fi
  sleep 2
done
docker compose exec -T api wget -qO- http://localhost:8080/v3/api-docs | grep -q '"openapi"'
allowed_cors="$(docker compose exec -T api wget -S -O /dev/null --method=OPTIONS --header='Origin: http://localhost:5177' --header='Access-Control-Request-Method: GET' http://localhost:8080/api/v1/paths 2>&1 || true)"
printf '%s' "$allowed_cors" | grep -qi 'access-control-allow-origin: http://localhost:5177'
blocked_cors="$(docker compose exec -T api wget -S -O /dev/null --method=OPTIONS --header='Origin: https://untrusted.example' --header='Access-Control-Request-Method: GET' http://localhost:8080/api/v1/paths 2>&1 || true)"
if printf '%s' "$blocked_cors" | grep -qi 'access-control-allow-origin:'; then echo "untrusted CORS origin was allowed" >&2; exit 1; fi

migration_db="migration_check_$(date +%s%N)"
docker compose exec -T db createdb -U "${POSTGRES_USER:-know}" "$migration_db"
for migration in backend/src/main/resources/db/migration/V{1..9}__*.sql; do
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-know}" -d "$migration_db" < "$migration" >/dev/null
done
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-know}" -d "$migration_db" >/dev/null <<'SQL'
insert into app_user (id, email, password_hash, display_name)
values ('00000000-0000-4000-8000-000000000001', 'legacy-import@example.com', 'hash', 'Legacy');
insert into path (id, user_id, name)
values ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Legacy path');
insert into time_entry (id, user_id, path_id, started_at, ended_at, duration_seconds, description, source, created_at)
values
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '2026-08-25T09:00:00Z', '2026-08-25T10:00:00Z', 3600, 'Legacy import A', 'IMPORT', '2026-08-25T23:50:41Z'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '2026-08-25T11:00:00Z', '2026-08-25T12:00:00Z', 3600, 'Legacy import B', 'IMPORT', '2026-08-25T23:52:41Z');
insert into activity (id, user_id, path_id, type, title, detail, occurred_at)
values
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'TIME_TRACKED', 'Imported Clockify session', 'Legacy import A', '2026-08-25T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'TIME_TRACKED', 'Imported Clockify session', 'Legacy import B', '2026-08-25T11:00:00Z');
SQL
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-know}" -d "$migration_db" < backend/src/main/resources/db/migration/V10__backfill_clockify_import_batches.sql >/dev/null
legacy_batch_count="$(docker compose exec -T db psql -At -U "${POSTGRES_USER:-know}" -d "$migration_db" -c "select count(*) from import_batch where user_id='00000000-0000-4000-8000-000000000001';")"
[[ "$legacy_batch_count" == "2" ]]
legacy_entry_count="$(docker compose exec -T db psql -At -U "${POSTGRES_USER:-know}" -d "$migration_db" -c "select count(*) from time_entry where source='IMPORT' and import_batch_id is not null;")"
[[ "$legacy_entry_count" == "2" ]]
legacy_activity_count="$(docker compose exec -T db psql -At -U "${POSTGRES_USER:-know}" -d "$migration_db" -c "select count(*) from activity where title='Imported Clockify session' and import_batch_id is not null;")"
[[ "$legacy_activity_count" == "2" ]]

if [[ "${SMOKE_FULL_STACK:-0}" == "1" ]]; then
  proxy_id="$(docker compose ps -q proxy)"
  for attempt in {1..30}; do
    proxy_health="$(docker inspect -f '{{.State.Health.Status}}' "$proxy_id" 2>/dev/null || true)"
    if [[ "$proxy_health" == "healthy" ]]; then break; fi
    if [[ "$proxy_health" == "unhealthy" || "$attempt" == 30 ]]; then echo "web proxy health check failed" >&2; exit 1; fi
    sleep 2
  done
  for attempt in {1..30}; do
    if curl -kfsSL "https://localhost:${PROXY_HTTPS_PORT}"/ | grep -q 'id="app"'; then break; fi
    if [[ "$attempt" == 30 ]]; then echo "web proxy did not become ready" >&2; exit 1; fi
    sleep 2
  done
  curl -kfsSI "https://localhost:${PROXY_HTTPS_PORT}"/ | grep -qi '^x-content-type-options: nosniff'
  curl -kfsSI "https://localhost:${PROXY_HTTPS_PORT}"/ | grep -qi '^x-frame-options: DENY'
  curl -kfsSI "https://localhost:${PROXY_HTTPS_PORT}"/ | grep -qi '^content-security-policy:'
  curl -kfsSI "https://localhost:${PROXY_HTTPS_PORT}"/ | grep -qi '^permissions-policy:'
  curl -kfsSI -X OPTIONS -H 'Origin: http://localhost:5177' -H 'Access-Control-Request-Method: GET' "https://localhost:${PROXY_HTTPS_PORT}"/api/v1/paths | grep -qi '^access-control-allow-origin: http://localhost:5177'
  if curl -kfsSI -X OPTIONS -H 'Origin: https://untrusted.example' -H 'Access-Control-Request-Method: GET' "https://localhost:${PROXY_HTTPS_PORT}"/api/v1/paths | grep -qi '^access-control-allow-origin:'; then echo "untrusted CORS origin was allowed" >&2; exit 1; fi
  proxy_email="proxy-$(date +%s%N)@example.com"
  curl -kfsSL -H 'Content-Type: application/json' --data "{\"email\":\"$proxy_email\",\"password\":\"correct-horse-battery\"}" "https://localhost:${PROXY_HTTPS_PORT}/api/v1/auth/register" | grep -q '"token"'
fi

api() { docker compose exec -T api wget -qO- "$@"; }
email="smoke-$(date +%s%N)@example.com"
auth="$(api --header='Content-Type: application/json' --post-data="{\"email\":\"$email\",\"password\":\"correct-horse-battery\"}" http://localhost:8080/api/v1/auth/register)"
token="$(printf '%s' "$auth" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
[[ -n "$token" ]]
header=(--header="Authorization: Bearer $token")
if api --header='Content-Type: application/json' --post-data='{"idToken":"not-a-real-google-token"}' http://localhost:8080/api/v1/auth/google >/dev/null; then echo "invalid Google identity token was accepted" >&2; exit 1; fi
if api --header='Content-Type: application/json' --post-data="{\"email\":\"${email^^}\",\"password\":\"correct-horse-battery\"}" http://localhost:8080/api/v1/auth/register >/dev/null; then echo "case-variant email was accepted" >&2; exit 1; fi

path="$(api "${header[@]}" --header='Content-Type: application/json' --post-data='{"name":"Smoke path"}' http://localhost:8080/api/v1/paths)"
path_id="$(printf '%s' "$path" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
other_path="$(api "${header[@]}" --header='Content-Type: application/json' --post-data='{"name":"Other smoke path"}' http://localhost:8080/api/v1/paths)"
other_path_id="$(printf '%s' "$other_path" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
import_start="$(date -u -d '20 minutes ago' +%Y-%m-%dT%H:%M:%SZ)"
import_end="$(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ)"
clockify_import="$(api "${header[@]}" --header='Content-Type: application/json' --post-data="{\"timeentries\":[{\"_id\":\"clockify-smoke-1\",\"description\":\"Imported smoke session\",\"projectName\":\"Imported Clockify path\",\"timeInterval\":{\"start\":\"$import_start\",\"end\":\"$import_end\"}}]}" http://localhost:8080/api/v1/imports/clockify)"
printf '%s' "$clockify_import" | grep -q '"imported":1'
printf '%s' "$clockify_import" | grep -q '"createdPaths":1'
clockify_batch_id="$(printf '%s' "$clockify_import" | sed -n 's/.*"batchId":"\([^"]*\)".*/\1/p')"
[[ -n "$clockify_batch_id" ]]
api "${header[@]}" http://localhost:8080/api/v1/imports/clockify/batches | grep -q "$clockify_batch_id"
api "${header[@]}" --header='Content-Type: application/json' --post-data="{\"timeentries\":[{\"_id\":\"clockify-smoke-1\",\"description\":\"Imported smoke session\",\"projectName\":\"Imported Clockify path\",\"timeInterval\":{\"start\":\"$import_start\",\"end\":\"$import_end\"}}]}" http://localhost:8080/api/v1/imports/clockify | grep -q '"skipped":1'
api "${header[@]}" --method=DELETE "http://localhost:8080/api/v1/imports/clockify/batches/$clockify_batch_id" | grep -q '"deletedEntries":1'
if api "${header[@]}" http://localhost:8080/api/v1/time-entries | grep -q 'Imported smoke session'; then echo "Clockify import undo did not remove imported time entries" >&2; exit 1; fi
other_auth="$(api --header='Content-Type: application/json' --post-data="{\"email\":\"other-$email\",\"password\":\"correct-horse-battery\"}" http://localhost:8080/api/v1/auth/register)"
other_token="$(printf '%s' "$other_auth" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
other_header=(--header="Authorization: Bearer $other_token")
if api "${other_header[@]}" "http://localhost:8080/api/v1/paths/$path_id" >/dev/null; then echo "cross-user path access was allowed" >&2; exit 1; fi
item="$(api "${header[@]}" --header='Content-Type: application/json' --post-data="{\"title\":\"Smoke item\",\"type\":\"MOVIE\",\"pathIds\":[\"$path_id\"],\"tags\":[\"smoke\"]}" http://localhost:8080/api/v1/items)"
item_id="$(printf '%s' "$item" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
printf '%s' "$item" | grep -q '"smoke"'
printf '%s' "$item" | grep -q '"type":"MOVIE"'
api "${header[@]}" http://localhost:8080/api/v1/items | grep -q 'Smoke item'
api "${header[@]}" --header='Content-Type: application/json' --method=PUT --body-data="{\"title\":\"Smoke item\",\"type\":\"PAPER\",\"status\":\"ACTIVE\",\"pathIds\":[\"$path_id\"],\"tags\":[\"smoke\"]}" "http://localhost:8080/api/v1/items/$item_id" | grep -q '"type":"PAPER"'
api "${header[@]}" --header='Content-Type: application/json' --method=PUT --body-data="{\"title\":\"Smoke item\",\"type\":\"PAPER\",\"source\":\"Smoke source\",\"status\":\"ACTIVE\",\"pathIds\":[\"$path_id\"],\"tags\":[\"smoke\"]}" "http://localhost:8080/api/v1/items/$item_id" | grep -q '"source":"Smoke source"'

progress="$(api "${header[@]}" --header='Content-Type: application/json' --post-data='{"progress":50}' "http://localhost:8080/api/v1/items/$item_id/progress")"
printf '%s' "$progress" | grep -q '"progress":50'
api "${header[@]}" --header='Content-Type: application/json' --post-data='{"progress":100}' "http://localhost:8080/api/v1/items/$item_id/progress" | grep -q '"status":"COMPLETED"'
api "${header[@]}" --header='Content-Type: application/json' --post-data='{"progress":50}' "http://localhost:8080/api/v1/items/$item_id/progress" | grep -q '"status":"ACTIVE"'
api "${header[@]}" --header='Content-Type: application/json' --post-data='{"progress":100}' "http://localhost:8080/api/v1/items/$item_id/progress" | grep -q '"status":"COMPLETED"'
note="$(api "${header[@]}" --header='Content-Type: application/json' --post-data="{\"itemId\":\"$item_id\",\"title\":\"Smoke note\",\"content\":\"Persisted knowledge\"}" http://localhost:8080/api/v1/notes)"
note_id="$(printf '%s' "$note" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
api "${header[@]}" --header='Content-Type: application/json' --method=PUT --body-data='{"title":"Edited smoke note","content":"Updated knowledge"}' "http://localhost:8080/api/v1/notes/$note_id" | grep -q 'Updated knowledge'
activity_id="$(api "${header[@]}" "http://localhost:8080/api/v1/activities?itemId=$item_id" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -n 1)"
[[ -n "$activity_id" ]]
api "${header[@]}" --header='Content-Type: application/json' --post-data="{\"activityId\":\"$activity_id\",\"title\":\"Activity reflection\",\"content\":\"The smoke workflow persisted this reflection.\"}" http://localhost:8080/api/v1/notes >/dev/null
if api "${header[@]}" --header='Content-Type: application/json' --post-data="{\"pathId\":\"$other_path_id\",\"itemId\":\"$item_id\",\"description\":\"Mismatched smoke timer\"}" http://localhost:8080/api/v1/timers >/dev/null; then echo "unrelated path/item timer was allowed" >&2; exit 1; fi
running_timer="$(api "${header[@]}" --header='Content-Type: application/json' --post-data="{\"pathId\":\"$path_id\",\"itemId\":\"$item_id\",\"description\":\"Smoke session\"}" http://localhost:8080/api/v1/timers)"
timer_id="$(printf '%s' "$running_timer" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
timer_start="$(date -u -d '30 seconds ago' +%Y-%m-%dT%H:%M:%SZ)"
api "${header[@]}" --header='Content-Type: application/json' --method=PUT --body-data="{\"pathId\":\"$path_id\",\"itemId\":\"$item_id\",\"startedAt\":\"$timer_start\",\"description\":\"Reconfigured smoke session\"}" "http://localhost:8080/api/v1/timers/$timer_id" | grep -q 'Reconfigured smoke session'
if api "${header[@]}" --header='Content-Type: application/json' --post-data="{\"pathId\":\"$path_id\",\"itemId\":\"$item_id\",\"description\":\"duplicate smoke timer\"}" http://localhost:8080/api/v1/timers >/dev/null; then echo "duplicate timer was allowed" >&2; exit 1; fi
api "${header[@]}" http://localhost:8080/api/v1/timers/current | grep -q '"running":true'
api "${header[@]}" --post-data='' --header='Content-Type: application/json' http://localhost:8080/api/v1/timers/stop >/dev/null
api "${header[@]}" --post-data='{"description":"cancelled smoke timer"}' --header='Content-Type: application/json' http://localhost:8080/api/v1/timers >/dev/null
api "${header[@]}" --post-data='' --header='Content-Type: application/json' http://localhost:8080/api/v1/timers/cancel >/dev/null
if [[ -n "$(api "${header[@]}" http://localhost:8080/api/v1/timers/current)" ]]; then echo "timer cancellation failed" >&2; exit 1; fi
smoke_date="$(date -u +%Y-%m-%d)"
manual_start="$(date -u -d '2 hours ago' +%Y-%m-%dT%H:00:00Z)"
manual_end="$(date -u -d '75 minutes ago' +%Y-%m-%dT%H:%M:%SZ)"
manual="$(api "${header[@]}" --header='Content-Type: application/json' --post-data="{\"pathId\":\"$path_id\",\"itemId\":\"$item_id\",\"startedAt\":\"$manual_start\",\"endedAt\":\"$manual_end\",\"description\":\"Editable session\"}" http://localhost:8080/api/v1/time-entries)"
time_id="$(printf '%s' "$manual" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
edited_start="$(date -u -d '105 minutes ago' +%Y-%m-%dT%H:%M:%SZ)"
edited_end="$(date -u -d '60 minutes ago' +%Y-%m-%dT%H:%M:%SZ)"
api "${header[@]}" --header='Content-Type: application/json' --method=PUT --body-data="{\"pathId\":\"$path_id\",\"itemId\":\"$item_id\",\"startedAt\":\"$edited_start\",\"endedAt\":\"$edited_end\",\"description\":\"Edited session\"}" "http://localhost:8080/api/v1/time-entries/$time_id" | grep -q '"durationSeconds":2700'
api "${header[@]}" "http://localhost:8080/api/v1/time-entries" | grep -q 'Edited session'
month_start="$(date -u +%Y-%m-01T10:00:00Z)"
month_end="$(date -u -d "$month_start + 10 minutes" +%Y-%m-%dT%H:%M:%SZ)"
api "${header[@]}" --header='Content-Type: application/json' --post-data="{\"pathId\":\"$path_id\",\"itemId\":\"$item_id\",\"startedAt\":\"$month_start\",\"endedAt\":\"$month_end\",\"description\":\"Earlier current-month session\"}" http://localhost:8080/api/v1/time-entries >/dev/null
summary="$(api "${header[@]}" "http://localhost:8080/api/v1/paths/$path_id/summary")"
printf '%s' "$summary" | grep -q 'Smoke path'
summary_seconds="$(printf '%s' "$summary" | sed -n 's/.*"trackedSeconds":\([0-9]*\).*/\1/p')"
(( summary_seconds >= 2700 ))
paths_order="$(api "${header[@]}" http://localhost:8080/api/v1/paths)"
[[ "$paths_order" == *'Smoke path'*'Other smoke path'* ]]
api "${header[@]}" 'http://localhost:8080/api/v1/search?q=Smoke' | grep -q 'Smoke item'
api "${header[@]}" 'http://localhost:8080/api/v1/search?q=Completed' | grep -q 'ACTIVITY'
api "${header[@]}" 'http://localhost:8080/api/v1/search?q=Smoke' | grep -q 'ACTIVITY'
api "${header[@]}" "http://localhost:8080/api/v1/activities?itemId=$item_id" | grep -q 'PROGRESS_CHANGED'
api "${header[@]}" "http://localhost:8080/api/v1/activities?itemId=$item_id&from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z" | grep -q 'PROGRESS_CHANGED'
statistics="$(api "${header[@]}" http://localhost:8080/api/v1/statistics)"
printf '%s' "$statistics" | grep -q 'completedItems'
month_seconds="$(printf '%s' "$statistics" | sed -n 's/.*"monthSeconds":\([0-9]*\).*/\1/p')"
(( month_seconds >= 3300 ))
report="$(api "${header[@]}" "http://localhost:8080/api/v1/reports?period=MONTH&anchor=$smoke_date")"
[[ "$report" == *'"period":"MONTH"'* ]]
[[ "$report" == *'"days"'* ]]
[[ "$report" == *'"paths"'* ]]
if [[ "${SMOKE_BACKUP_RESTORE:-0}" == "1" ]]; then
  backup_dir="$(mktemp -d)"
  backup_file="$backup_dir/know.sql"
  ./deployment/backup.sh "$backup_file" >/dev/null
  restore_db="restore_check_$(date +%s%N)"
  docker compose exec -T db createdb -U "${POSTGRES_USER:-know}" "$restore_db"
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-know}" -d "$restore_db" < "$backup_file" >/dev/null
  restored_count="$(docker compose exec -T db psql -At -U "${POSTGRES_USER:-know}" -d "$restore_db" -c "select count(*) from app_user where email='$email';")"
  [[ "$restored_count" == "1" ]]
fi
echo "Smoke test passed"
