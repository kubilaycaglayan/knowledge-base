#!/usr/bin/env bash
set -euo pipefail

: "${JWT_SECRET:?Set JWT_SECRET to a random value before running smoke tests}"
: "${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD to the password used by the database volume}"
if (( ${#JWT_SECRET} < 32 )); then
  echo "JWT_SECRET must be at least 32 characters" >&2
  exit 1
fi
if [[ -z "${COMPOSE_PROJECT_NAME:-}" ]]; then
  export COMPOSE_PROJECT_NAME="knowledge-base-smoke-${BASHPID}-$(date +%s%N)"
elif [[ "$COMPOSE_PROJECT_NAME" != *smoke* ]]; then
  echo "COMPOSE_PROJECT_NAME must contain 'smoke' so cleanup cannot target a persistent stack" >&2
  exit 1
fi
: "${DB_DEV_PORT:=15432}"
: "${API_DEV_PORT:=18081}"
export DB_DEV_PORT API_DEV_PORT
if [[ "${SMOKE_FULL_STACK:-0}" == "1" ]]; then
  : "${PROXY_DEV_PORT:=18000}"
  : "${PROXY_HTTP_PORT:=18080}"
  : "${PROXY_HTTPS_PORT:=18443}"
  export PROXY_DEV_PORT PROXY_HTTP_PORT PROXY_HTTPS_PORT
fi

compose_files=(-f docker-compose.yml -f docker-compose.smoke.yml)
if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  compose_files+=(-f docker-compose.smoke-gha-cache.yml)
elif [[ -n "${SMOKE_BUILD_CACHE_DIR:-}" ]]; then
  SMOKE_BUILD_CACHE_DIR="$(realpath -m "$SMOKE_BUILD_CACHE_DIR")"
  export SMOKE_BUILD_CACHE_DIR
  compose_files+=(-f docker-compose.smoke-local-cache.yml)
  [[ -f "$SMOKE_BUILD_CACHE_DIR/api/index.json" ]] && compose_files+=(-f docker-compose.smoke-local-api-cache-from.yml)
  [[ -f "$SMOKE_BUILD_CACHE_DIR/web/index.json" ]] && compose_files+=(-f docker-compose.smoke-local-web-cache-from.yml)
fi
compose() { docker compose "${compose_files[@]}" "$@"; }

backup_dir=""
restore_db=""
migration_db=""
buildx_builder=""
cleanup() {
  if [[ -n "$restore_db" ]]; then
    compose exec -T db dropdb --if-exists -U "${POSTGRES_USER:-know}" "$restore_db" >/dev/null 2>&1 || true
  fi
  if [[ -n "$migration_db" ]]; then
    compose exec -T db dropdb --if-exists -U "${POSTGRES_USER:-know}" "$migration_db" >/dev/null 2>&1 || true
  fi
  # The project name is generated or explicitly smoke-scoped above. Remove
  # only its Compose-managed volumes; external volumes are never removed.
  compose down --volumes --remove-orphans --rmi local >/dev/null 2>&1 || true
  if [[ -n "$buildx_builder" ]]; then
    # Temporary smoke builders must not leave their intermediate BuildKit
    # records in the Docker engine after the test stack is removed.
    docker buildx prune --builder "$buildx_builder" --all --force >/dev/null 2>&1 || true
    docker buildx rm --force "$buildx_builder" >/dev/null 2>&1 || true
  fi
  if [[ -n "$backup_dir" && -d "$backup_dir" ]]; then
    rm -rf "$backup_dir"
  fi
}
trap cleanup EXIT

services=(db api)
content_json=(--header='Content-Type: application/json')
if [[ "${SMOKE_FULL_STACK:-0}" == "1" ]]; then
  services+=(web proxy)
fi
buildx_builder="knowledge-base-smoke-${COMPOSE_PROJECT_NAME:-knowledge-base}-${BASHPID}-$(date +%s%N)"
if ! docker buildx create --name "$buildx_builder" --driver docker-container >/dev/null 2>&1; then
  echo "Smoke tests require Docker Buildx so their build cache can be cleaned safely" >&2
  exit 1
fi
export BUILDX_BUILDER="$buildx_builder"
compose up -d "${services[@]}" --build >/dev/null
for attempt in {1..30}; do
  if compose exec -T api wget -qO- http://localhost:8080/actuator/health | grep -q '"status":"UP"'; then
    break
  fi
  if [[ "$attempt" == 30 ]]; then
    echo "API did not become healthy" >&2
    exit 1
  fi
  sleep 2
done
compose exec -T api wget -qO- http://localhost:8080/v3/api-docs | grep -q '"openapi"'
allowed_cors="$(
  compose exec -T api wget -S -O /dev/null \
    --method=OPTIONS \
    --header='Origin: http://localhost:5177' \
    --header='Access-Control-Request-Method: GET' \
    http://localhost:8080/api/v1/paths 2>&1 || true
)"
printf '%s' "$allowed_cors" | grep -qi 'access-control-allow-origin: http://localhost:5177'
blocked_cors="$(
  compose exec -T api wget -S -O /dev/null \
    --method=OPTIONS \
    --header='Origin: https://untrusted.example' \
    --header='Access-Control-Request-Method: GET' \
    http://localhost:8080/api/v1/paths 2>&1 || true
)"
if printf '%s' "$blocked_cors" | grep -qi 'access-control-allow-origin:'; then
  echo "untrusted CORS origin was allowed" >&2
  exit 1
fi

migration_db="migration_check_$(date +%s%N)"
compose exec -T db createdb -U "${POSTGRES_USER:-know}" "$migration_db"
{
  for migration in backend/src/main/resources/db/migration/V{1..9}__*.sql; do cat "$migration"; done
  cat <<'SQL'
insert into app_user (id, email, password_hash, display_name)
values ('00000000-0000-4000-8000-000000000001', 'legacy-import@example.com', 'hash', 'Legacy');
insert into path (id, user_id, name)
values ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Legacy path');
insert into time_entry (id, user_id, path_id, started_at, ended_at, duration_seconds, description, source, created_at)
values
  (
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '2026-08-25T09:00:00Z',
    '2026-08-25T10:00:00Z',
    3600,
    'Legacy import A',
    'IMPORT',
    '2026-08-25T23:50:41Z'
  ),
  (
    '00000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '2026-08-25T11:00:00Z',
    '2026-08-25T12:00:00Z',
    3600,
    'Legacy import B',
    'IMPORT',
    '2026-08-25T23:52:41Z'
  );
insert into activity (id, user_id, path_id, type, title, detail, occurred_at)
values
  (
    '00000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    'TIME_TRACKED',
    'Imported Clockify session',
    'Legacy import A',
    '2026-08-25T09:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000006',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    'TIME_TRACKED',
    'Imported Clockify session',
    'Legacy import B',
    '2026-08-25T11:00:00Z'
  );
SQL
  cat backend/src/main/resources/db/migration/V10__backfill_clockify_import_batches.sql
  for migration in backend/src/main/resources/db/migration/V{11..16}__*.sql; do cat "$migration"; done
} | compose exec -T db psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-know}" -d "$migration_db" >/dev/null
legacy_batch_count="$(
  compose exec -T db psql -At -U "${POSTGRES_USER:-know}" -d "$migration_db" \
    -c "select count(*) from import_batch where user_id='00000000-0000-4000-8000-000000000001';"
)"
[[ "$legacy_batch_count" == "2" ]]
legacy_entry_count="$(
  compose exec -T db psql -At -U "${POSTGRES_USER:-know}" -d "$migration_db" \
    -c "select count(*) from time_entry where source='IMPORT' and import_batch_id is not null;"
)"
[[ "$legacy_entry_count" == "2" ]]
legacy_activity_count="$(
  compose exec -T db psql -At -U "${POSTGRES_USER:-know}" -d "$migration_db" \
    -c "select count(*) from item_event where title='Imported Clockify session' and import_batch_id is not null;"
)"
[[ "$legacy_activity_count" == "2" ]]
[[ "$(compose exec -T db psql -At -U "${POSTGRES_USER:-know}" -d "$migration_db" -c "select to_regclass('public.activity');")" == "" ]]

if [[ "${SMOKE_FULL_STACK:-0}" == "1" ]]; then
  for attempt in {1..30}; do
    if curl -kfsS --connect-timeout 2 --max-time 5 "https://localhost:${PROXY_HTTPS_PORT}"/ | grep -q 'id="app"'; then
      break
    fi
    if [[ "$attempt" == 30 ]]; then
      echo "web proxy did not become ready" >&2
      exit 1
    fi
    sleep 2
  done
  proxy_headers="$(curl -kfsSI --connect-timeout 2 --max-time 5 "https://localhost:${PROXY_HTTPS_PORT}"/)"
  printf '%s' "$proxy_headers" | grep -qi '^x-content-type-options: nosniff'
  printf '%s' "$proxy_headers" | grep -qi '^x-frame-options: DENY'
  printf '%s' "$proxy_headers" | grep -qi '^content-security-policy:'
  printf '%s' "$proxy_headers" | grep -qi '^permissions-policy:'
  # The theme bootstrap must be served as JavaScript through the deployed proxy.
  curl -kfsS --connect-timeout 2 --max-time 5 "https://localhost:${PROXY_HTTPS_PORT}/theme.js" \
    | grep -q 'knowledge-base-theme'
  curl -kfsSI -X OPTIONS \
    -H 'Origin: http://localhost:5177' \
    -H 'Access-Control-Request-Method: GET' \
    "https://localhost:${PROXY_HTTPS_PORT}"/api/v1/paths \
    | grep -qi '^access-control-allow-origin: http://localhost:5177'
  if curl -kfsSI -X OPTIONS \
    -H 'Origin: https://untrusted.example' \
    -H 'Access-Control-Request-Method: GET' \
    "https://localhost:${PROXY_HTTPS_PORT}"/api/v1/paths \
    | grep -qi '^access-control-allow-origin:'; then
    echo "untrusted CORS origin was allowed" >&2
    exit 1
  fi
  proxy_email="proxy-$(date +%s%N)@example.com"
  curl -kfsSL "${content_json[@]}" \
    --data "{\"email\":\"$proxy_email\",\"password\":\"correct-horse-battery\"}" \
    "https://localhost:${PROXY_HTTPS_PORT}/api/v1/auth/register" \
    | grep -q '"token"'
fi

api() { compose exec -T api wget -qO- "$@"; }
email="smoke-$(date +%s%N)@example.com"
auth="$(api "${content_json[@]}" --post-data="{\"email\":\"$email\",\"password\":\"correct-horse-battery\"}" http://localhost:8080/api/v1/auth/register)"
token="$(printf '%s' "$auth" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
[[ -n "$token" ]]
header=(--header="Authorization: Bearer $token")

# A deployment must accept a token issued by the previous API container.
compose up -d --no-deps --force-recreate api
for attempt in {1..60}; do
  if api http://localhost:8080/actuator/health 2>/dev/null | grep -q '"status":"UP"'; then
    break
  fi
  if [[ "$attempt" == 60 ]]; then
    echo 'Recreated API did not become healthy' >&2
    exit 1
  fi
  sleep 2
done
api "${header[@]}" http://localhost:8080/api/v1/auth/me | grep -Fq "$email"
# Servlet error dispatches must not turn a valid session into a 401.
missing_response="$(compose exec -T api wget -S -O /dev/null "${header[@]}" \
  http://localhost:8080/api/v1/session-continuity-missing-route 2>&1 || true)"
printf '%s' "$missing_response" | grep -q 'HTTP/1.1 404'
api "${header[@]}" http://localhost:8080/api/v1/auth/me | grep -Fq "$email"
if [[ "${SMOKE_FULL_STACK:-0}" == "1" ]]; then
  curl -kfsS --retry 15 --retry-connrefused --retry-delay 2 \
    -H "Authorization: Bearer $token" \
    "https://localhost:${PROXY_HTTPS_PORT}/api/v1/auth/me" | grep -Fq "$email"
fi
api http://localhost:8080/api/v1/auth/google/config | grep -q '"clientId"'
if api "${content_json[@]}" --post-data='{"idToken":"not-a-real-google-token"}' \
  http://localhost:8080/api/v1/auth/google >/dev/null; then
  echo "invalid Google identity token was accepted" >&2
  exit 1
fi
if api "${content_json[@]}" \
  --post-data="{\"email\":\"${email^^}\",\"password\":\"correct-horse-battery\"}" \
  http://localhost:8080/api/v1/auth/register >/dev/null; then
  echo "case-variant email was accepted" >&2
  exit 1
fi

path="$(api "${header[@]}" "${content_json[@]}" --post-data='{"name":"Smoke path"}' http://localhost:8080/api/v1/paths)"
path_id="$(printf '%s' "$path" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
other_path="$(api "${header[@]}" "${content_json[@]}" --post-data='{"name":"Other smoke path"}' http://localhost:8080/api/v1/paths)"
other_path_id="$(printf '%s' "$other_path" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
import_start="$(date -u -d '20 minutes ago' +%Y-%m-%dT%H:%M:%SZ)"
import_end="$(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ)"
clockify_payload="$(
  printf '{"timeentries":[{"_id":"clockify-smoke-1",'
  printf '"description":"Imported smoke session",'
  printf '"projectName":"Imported Clockify path",'
  printf '"timeInterval":{"start":"%s","end":"%s"}}]}' "$import_start" "$import_end"
)"
clockify_import="$(
  api "${header[@]}" "${content_json[@]}" \
    --post-data="$clockify_payload" \
    http://localhost:8080/api/v1/imports/clockify
)"
printf '%s' "$clockify_import" | grep -q '"imported":1'
printf '%s' "$clockify_import" | grep -q '"createdPaths":1'
clockify_batch_id="$(printf '%s' "$clockify_import" | sed -n 's/.*"batchId":"\([^"]*\)".*/\1/p')"
[[ -n "$clockify_batch_id" ]]
api "${header[@]}" http://localhost:8080/api/v1/imports/clockify/batches | grep -q "$clockify_batch_id"
api "${header[@]}" "${content_json[@]}" \
  --post-data="$clockify_payload" \
  http://localhost:8080/api/v1/imports/clockify \
  | grep -q '"skipped":1'
api "${header[@]}" --method=DELETE "http://localhost:8080/api/v1/imports/clockify/batches/$clockify_batch_id" | grep -q '"deletedEntries":1'
if api "${header[@]}" http://localhost:8080/api/v1/time-entries | grep -q 'Imported smoke session'; then
  echo "Clockify import undo did not remove imported time entries" >&2
  exit 1
fi
other_auth="$(api "${content_json[@]}" --post-data="{\"email\":\"other-$email\",\"password\":\"correct-horse-battery\"}" http://localhost:8080/api/v1/auth/register)"
other_token="$(printf '%s' "$other_auth" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
other_header=(--header="Authorization: Bearer $other_token")
if api "${other_header[@]}" "http://localhost:8080/api/v1/paths/$path_id" >/dev/null; then
  echo "cross-user path access was allowed" >&2
  exit 1
fi
note_payload="$(printf '{"pathId":"%s","title":"Smoke note","content":"{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Persisted knowledge\"}]}]}","contentText":"Persisted knowledge","tags":["Smoke"]}' "$path_id")"
note="$(api "${header[@]}" "${content_json[@]}" --post-data="$note_payload" http://localhost:8080/api/v1/notes)"
note_id="$(printf '%s' "$note" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
[[ -n "$note_id" ]]
api "${header[@]}" http://localhost:8080/api/v1/notes?page=0\&size=20\&q=Smoke | grep -q 'Smoke note'
api "${header[@]}" "${content_json[@]}" --method=PUT \
  --body-data='{"title":"Edited smoke note","content":"{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Updated knowledge\"}]}]}","contentText":"Updated knowledge","tags":["Smoke"]}' \
  "http://localhost:8080/api/v1/notes/$note_id" \
  | grep -q 'Updated knowledge'
api "${header[@]}" --method=DELETE "http://localhost:8080/api/v1/notes/$note_id" >/dev/null
api "${header[@]}" --post-data='' "${content_json[@]}" "http://localhost:8080/api/v1/notes/$note_id/restore" >/dev/null
if api "${other_header[@]}" "http://localhost:8080/api/v1/notes/$note_id" >/dev/null; then
  echo "cross-user note access was allowed" >&2
  exit 1
fi
log_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
log="$(api "${header[@]}" "${content_json[@]}" --post-data="{\"body\":\"Smoke log\",\"occurredAt\":\"$log_time\"}" http://localhost:8080/api/v1/logs)"
log_id="$(printf '%s' "$log" | sed -n 's/.*"id":"\([^\"]*\)".*/\1/p')"
[[ -n "$log_id" ]]
api "${header[@]}" http://localhost:8080/api/v1/logs | grep -q 'Smoke log'
api "${header[@]}" "${content_json[@]}" --method=PUT \
  --body-data="{\"body\":\"Edited smoke log\",\"occurredAt\":\"$log_time\"}" \
  "http://localhost:8080/api/v1/logs/$log_id" | grep -q 'Edited smoke log'
if api "${other_header[@]}" "http://localhost:8080/api/v1/logs/$log_id" >/dev/null; then
  echo "cross-user log access was allowed" >&2
  exit 1
fi
discarded_timer="$(api "${header[@]}" "${content_json[@]}" --post-data='{"labelIds":[],"description":"Discarded quick timer"}' http://localhost:8080/api/v1/timers)"
discarded_timer_id="$(printf '%s' "$discarded_timer" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
api "${header[@]}" --post-data='' "${content_json[@]}" "http://localhost:8080/api/v1/timers/$discarded_timer_id/stop" >/dev/null
if api "${header[@]}" "http://localhost:8080/api/v1/time-entries?page=0&size=50" | grep -q 'Discarded quick timer'; then
  echo "timer under two seconds was recorded" >&2
  exit 1
fi
running_timer="$(api "${header[@]}" "${content_json[@]}" --post-data="{\"pathId\":\"$path_id\",\"labelIds\":[],\"description\":\"Smoke session\"}" http://localhost:8080/api/v1/timers)"
timer_id="$(printf '%s' "$running_timer" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
timer_start="$(date -u -d '30 seconds ago' +%Y-%m-%dT%H:%M:%SZ)"
api "${header[@]}" "${content_json[@]}" --method=PUT \
  --body-data="{\"pathId\":\"$path_id\",\"labelIds\":[],\"startedAt\":\"$timer_start\",\"description\":\"Reconfigured smoke session\"}" \
  "http://localhost:8080/api/v1/timers/$timer_id" \
  | grep -q 'Reconfigured smoke session'
if api "${header[@]}" "${content_json[@]}" \
  --post-data="{\"pathId\":\"$path_id\",\"labelIds\":[],\"description\":\"duplicate smoke timer\"}" \
  http://localhost:8080/api/v1/timers >/dev/null; then
  echo "duplicate timer was allowed" >&2
  exit 1
fi
api "${header[@]}" http://localhost:8080/api/v1/timers/current | grep -q '"running":true'
api "${header[@]}" --post-data='' "${content_json[@]}" http://localhost:8080/api/v1/timers/stop >/dev/null
api "${header[@]}" "${content_json[@]}" \
  --post-data="{\"pathId\":\"$path_id\",\"labelIds\":[],\"description\":\"cancelled smoke timer\"}" \
  http://localhost:8080/api/v1/timers >/dev/null
api "${header[@]}" --post-data='' "${content_json[@]}" http://localhost:8080/api/v1/timers/cancel >/dev/null
if [[ -n "$(api "${header[@]}" http://localhost:8080/api/v1/timers/current)" ]]; then
  echo "timer cancellation failed" >&2
  exit 1
fi
smoke_date="$(date -u +%Y-%m-%d)"
calendar_label="$(api "${header[@]}" "${content_json[@]}" --post-data='{"name":"Smoke leave","color":"#2878D5","scopes":["CALENDAR","TIME_ENTRY"]}' http://localhost:8080/api/v1/labels)"
calendar_label_id="$(printf '%s' "$calendar_label" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
calendar_day="$(api "${header[@]}" "${content_json[@]}" --method=PUT \
  --body-data="{\"note\":\"Calendar smoke record\",\"labels\":[{\"labelId\":\"$calendar_label_id\",\"portion\":1.0}]}" \
  "http://localhost:8080/api/v1/calendar/days/$smoke_date")"
[[ "$calendar_day" == *'Calendar smoke record'* ]]
api "${header[@]}" "http://localhost:8080/api/v1/calendar/days?startDate=$smoke_date&endDate=$smoke_date" | grep -q 'Smoke leave'
calendar_range_end="$(date -u -d "$smoke_date + 1 day" +%Y-%m-%d)"
api "${header[@]}" "${content_json[@]}" --method=PUT \
  --body-data="{\"startDate\":\"$smoke_date\",\"endDate\":\"$calendar_range_end\",\"labels\":[{\"labelId\":\"$calendar_label_id\",\"portion\":1.0}]}" \
  http://localhost:8080/api/v1/calendar/days/range | grep -q "$calendar_range_end"
manual_start="$(date -u -d '2 hours ago' +%Y-%m-%dT%H:00:00Z)"
manual_end="$(date -u -d '75 minutes ago' +%Y-%m-%dT%H:%M:%SZ)"
manual="$(
  api "${header[@]}" "${content_json[@]}" \
    --post-data="{\"pathId\":\"$path_id\",\"labelIds\":[\"$calendar_label_id\"],\"startedAt\":\"$manual_start\",\"endedAt\":\"$manual_end\",\"description\":\"Editable session\"}" \
    http://localhost:8080/api/v1/time-entries
)"
time_id="$(printf '%s' "$manual" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
edited_start="$(date -u -d '105 minutes ago' +%Y-%m-%dT%H:%M:%SZ)"
edited_end="$(date -u -d '60 minutes ago' +%Y-%m-%dT%H:%M:%SZ)"
api "${header[@]}" "${content_json[@]}" --method=PUT \
  --body-data="{\"pathId\":\"$path_id\",\"labelIds\":[\"$calendar_label_id\"],\"startedAt\":\"$edited_start\",\"endedAt\":\"$edited_end\",\"description\":\"Edited session\"}" \
  "http://localhost:8080/api/v1/time-entries/$time_id" \
  | grep -q '"durationSeconds":2700'
api "${header[@]}" "http://localhost:8080/api/v1/time-entries" | grep -q 'Edited session'
month_start="$(date -u +%Y-%m-01T10:00:00Z)"
month_end="$(date -u -d "$month_start + 10 minutes" +%Y-%m-%dT%H:%M:%SZ)"
api "${header[@]}" "${content_json[@]}" \
  --post-data="{\"pathId\":\"$path_id\",\"labelIds\":[\"$calendar_label_id\"],\"startedAt\":\"$month_start\",\"endedAt\":\"$month_end\",\"description\":\"Earlier current-month session\"}" \
  http://localhost:8080/api/v1/time-entries >/dev/null
summary="$(api "${header[@]}" "http://localhost:8080/api/v1/paths/$path_id/summary")"
printf '%s' "$summary" | grep -q 'Smoke path'
summary_seconds="$(printf '%s' "$summary" | sed -n 's/.*"trackedSeconds":\([0-9]*\).*/\1/p')"
(( summary_seconds >= 2700 ))
paths_order="$(api "${header[@]}" http://localhost:8080/api/v1/paths)"
printf '%s' "$paths_order" | grep -q 'Smoke path'
printf '%s' "$paths_order" | grep -q 'Other smoke path'
api "${header[@]}" 'http://localhost:8080/api/v1/search?q=Smoke' | grep -q 'Smoke path'
api "${header[@]}" 'http://localhost:8080/api/v1/activities?from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z' | grep -q 'Smoke note'
statistics="$(api "${header[@]}" http://localhost:8080/api/v1/statistics)"
month_seconds="$(printf '%s' "$statistics" | sed -n 's/.*"monthSeconds":\([0-9]*\).*/\1/p')"
(( month_seconds >= 3300 ))
report_start="$(date -u -d "$smoke_date - 2 years" +%Y-%m-%d)"
report="$(api "${header[@]}" "http://localhost:8080/api/v1/reports?startDate=$report_start&endDate=$smoke_date&aggregation=QUARTER&pathId=$path_id&labelId=$calendar_label_id")"
[[ "$report" == *'"period":"CUSTOM"'* ]]
[[ "$report" == *'"granularity":"QUARTER"'* ]]
[[ "$report" == *'"days"'* ]]
[[ "$report" == *'"paths"'* ]]
[[ "$report" == *'"calendarLabels"'* ]]
[[ "$report" == *'Smoke leave'* ]]
# Merging moves all session history to the target and soft-deletes the source.
api "${header[@]}" "${content_json[@]}" \
  --post-data="{\"targetPathId\":\"$other_path_id\"}" \
  "http://localhost:8080/api/v1/paths/$path_id/merge" >/dev/null
if api "${header[@]}" "http://localhost:8080/api/v1/paths/$path_id" >/dev/null; then
  echo "merged source path is still readable" >&2
  exit 1
fi
api "${header[@]}" "http://localhost:8080/api/v1/time-entries" | grep -q "\"pathId\":\"$other_path_id\""
merged_summary="$(api "${header[@]}" "http://localhost:8080/api/v1/paths/$other_path_id/summary")"
merged_seconds="$(printf '%s' "$merged_summary" | sed -n 's/.*"trackedSeconds":\([0-9]*\).*/\1/p')"
(( merged_seconds >= 3300 ))
if [[ "${SMOKE_BACKUP_RESTORE:-0}" == "1" ]]; then
  backup_dir="$(mktemp -d)"
  backup_file="$backup_dir/knowledge-base.sql"
  ./deployment/backup.sh "$backup_file" >/dev/null
  restore_db="restore_check_$(date +%s%N)"
  compose exec -T db createdb -U "${POSTGRES_USER:-know}" "$restore_db"
  compose exec -T db psql -v ON_ERROR_STOP=1 \
    -U "${POSTGRES_USER:-know}" \
    -d "$restore_db" < "$backup_file" >/dev/null
  restored_count="$(
    compose exec -T db psql -At -U "${POSTGRES_USER:-know}" -d "$restore_db" \
      -c "select count(*) from app_user where email='$email';"
  )"
  [[ "$restored_count" == "1" ]]
fi
echo "Smoke test passed"
