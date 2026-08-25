#!/usr/bin/env bash
set -euo pipefail

: "${JWT_SECRET:?Set JWT_SECRET to a random value before running smoke tests}"
: "${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD to the password used by the database volume}"
if (( ${#JWT_SECRET} < 32 )); then echo "JWT_SECRET must be at least 32 characters" >&2; exit 1; fi

backup_dir=""
restore_db=""
cleanup() {
  if [[ -n "$restore_db" ]]; then docker compose exec -T db dropdb --if-exists -U "${POSTGRES_USER:-know}" "$restore_db" >/dev/null 2>&1 || true; fi
  docker compose down >/dev/null
  if [[ -n "$backup_dir" && -d "$backup_dir" ]]; then rm -rf "$backup_dir"; fi
}
trap cleanup EXIT

services=(db api)
if [[ "${SMOKE_FULL_STACK:-0}" == "1" ]]; then services+=(web proxy); fi
docker compose up -d "${services[@]}" --build >/dev/null
for attempt in {1..30}; do
  if docker compose exec -T api wget -qO- http://localhost:8080/actuator/health | grep -q '"status":"UP"'; then break; fi
  if [[ "$attempt" == 30 ]]; then echo "API did not become healthy" >&2; exit 1; fi
  sleep 2
done
docker compose exec -T api wget -qO- http://localhost:8080/v3/api-docs | grep -q '"openapi"'
if [[ "${SMOKE_FULL_STACK:-0}" == "1" ]]; then
  for attempt in {1..30}; do
    if curl -kfsSL https://localhost/ | grep -q 'id="app"'; then break; fi
    if [[ "$attempt" == 30 ]]; then echo "web proxy did not become ready" >&2; exit 1; fi
    sleep 2
  done
  curl -kfsSI https://localhost/ | grep -qi '^x-content-type-options: nosniff'
  curl -kfsSI https://localhost/ | grep -qi '^x-frame-options: DENY'
  curl -kfsSI https://localhost/ | grep -qi '^content-security-policy:'
  curl -kfsSI https://localhost/ | grep -qi '^permissions-policy:'
  proxy_email="proxy-$(date +%s%N)@example.com"
  curl -kfsSL -H 'Content-Type: application/json' --data "{\"email\":\"$proxy_email\",\"password\":\"correct-horse-battery\"}" https://localhost/api/v1/auth/register | grep -q '"token"'
fi

api() { docker compose exec -T api wget -qO- "$@"; }
email="smoke-$(date +%s%N)@example.com"
auth="$(api --header='Content-Type: application/json' --post-data="{\"email\":\"$email\",\"password\":\"correct-horse-battery\"}" http://localhost:8080/api/v1/auth/register)"
token="$(printf '%s' "$auth" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
[[ -n "$token" ]]
header=(--header="Authorization: Bearer $token")
if api --header='Content-Type: application/json' --post-data="{\"email\":\"${email^^}\",\"password\":\"correct-horse-battery\"}" http://localhost:8080/api/v1/auth/register >/dev/null; then echo "case-variant email was accepted" >&2; exit 1; fi

path="$(api "${header[@]}" --header='Content-Type: application/json' --post-data='{"name":"Smoke path"}' http://localhost:8080/api/v1/paths)"
path_id="$(printf '%s' "$path" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
other_auth="$(api --header='Content-Type: application/json' --post-data="{\"email\":\"other-$email\",\"password\":\"correct-horse-battery\"}" http://localhost:8080/api/v1/auth/register)"
other_token="$(printf '%s' "$other_auth" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
other_header=(--header="Authorization: Bearer $other_token")
if api "${other_header[@]}" "http://localhost:8080/api/v1/paths/$path_id" >/dev/null; then echo "cross-user path access was allowed" >&2; exit 1; fi
item="$(api "${header[@]}" --header='Content-Type: application/json' --post-data="{\"title\":\"Smoke item\",\"type\":\"PROJECT\",\"pathIds\":[\"$path_id\"],\"tags\":[\"smoke\"]}" http://localhost:8080/api/v1/items)"
item_id="$(printf '%s' "$item" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
printf '%s' "$item" | grep -q '"smoke"'
api "${header[@]}" http://localhost:8080/api/v1/items | grep -q 'Smoke item'
api "${header[@]}" --header='Content-Type: application/json' --method=PUT --body-data="{\"title\":\"Smoke item\",\"type\":\"PROJECT\",\"status\":\"ACTIVE\",\"pathIds\":[\"$path_id\"],\"tags\":[\"smoke\"]}" "http://localhost:8080/api/v1/items/$item_id" | grep -q 'Smoke item'

progress="$(api "${header[@]}" --header='Content-Type: application/json' --post-data='{"progress":50}' "http://localhost:8080/api/v1/items/$item_id/progress")"
printf '%s' "$progress" | grep -q '"progress":50'
api "${header[@]}" --header='Content-Type: application/json' --post-data='{"progress":100}' "http://localhost:8080/api/v1/items/$item_id/progress" | grep -q '"status":"COMPLETED"'
note="$(api "${header[@]}" --header='Content-Type: application/json' --post-data="{\"itemId\":\"$item_id\",\"title\":\"Smoke note\",\"content\":\"Persisted knowledge\"}" http://localhost:8080/api/v1/notes)"
note_id="$(printf '%s' "$note" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
api "${header[@]}" --header='Content-Type: application/json' --method=PUT --body-data='{"title":"Edited smoke note","content":"Updated knowledge"}' "http://localhost:8080/api/v1/notes/$note_id" | grep -q 'Updated knowledge'
activity_id="$(api "${header[@]}" "http://localhost:8080/api/v1/activities?itemId=$item_id" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -n 1)"
[[ -n "$activity_id" ]]
api "${header[@]}" --header='Content-Type: application/json' --post-data="{\"activityId\":\"$activity_id\",\"title\":\"Activity reflection\",\"content\":\"The smoke workflow persisted this reflection.\"}" http://localhost:8080/api/v1/notes >/dev/null
api "${header[@]}" --header='Content-Type: application/json' --post-data="{\"pathId\":\"$path_id\",\"itemId\":\"$item_id\",\"description\":\"Smoke session\"}" http://localhost:8080/api/v1/timers >/dev/null
if api "${header[@]}" --header='Content-Type: application/json' --post-data="{\"pathId\":\"$path_id\",\"itemId\":\"$item_id\",\"description\":\"duplicate smoke timer\"}" http://localhost:8080/api/v1/timers >/dev/null; then echo "duplicate timer was allowed" >&2; exit 1; fi
api "${header[@]}" http://localhost:8080/api/v1/timers/current | grep -q '"running":true'
api "${header[@]}" --post-data='' --header='Content-Type: application/json' http://localhost:8080/api/v1/timers/stop >/dev/null
api "${header[@]}" --post-data='{"description":"cancelled smoke timer"}' --header='Content-Type: application/json' http://localhost:8080/api/v1/timers >/dev/null
api "${header[@]}" --post-data='' --header='Content-Type: application/json' http://localhost:8080/api/v1/timers/cancel >/dev/null
if [[ -n "$(api "${header[@]}" http://localhost:8080/api/v1/timers/current)" ]]; then echo "timer cancellation failed" >&2; exit 1; fi
manual="$(api "${header[@]}" --header='Content-Type: application/json' --post-data="{\"pathId\":\"$path_id\",\"itemId\":\"$item_id\",\"startedAt\":\"2026-08-25T10:00:00Z\",\"endedAt\":\"2026-08-25T10:30:00Z\",\"description\":\"Editable session\"}" http://localhost:8080/api/v1/time-entries)"
time_id="$(printf '%s' "$manual" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
api "${header[@]}" --header='Content-Type: application/json' --method=PUT --body-data="{\"pathId\":\"$path_id\",\"itemId\":\"$item_id\",\"startedAt\":\"2026-08-25T11:00:00Z\",\"endedAt\":\"2026-08-25T11:45:00Z\",\"description\":\"Edited session\"}" "http://localhost:8080/api/v1/time-entries/$time_id" | grep -q '"durationSeconds":2700'
api "${header[@]}" "http://localhost:8080/api/v1/time-entries" | grep -q 'Edited session'
summary="$(api "${header[@]}" "http://localhost:8080/api/v1/paths/$path_id/summary")"
printf '%s' "$summary" | grep -q 'Smoke path'
summary_seconds="$(printf '%s' "$summary" | sed -n 's/.*"trackedSeconds":\([0-9]*\).*/\1/p')"
(( summary_seconds >= 2700 ))
api "${header[@]}" 'http://localhost:8080/api/v1/search?q=Smoke' | grep -q 'Smoke item'
api "${header[@]}" 'http://localhost:8080/api/v1/search?q=Completed' | grep -q 'ACTIVITY'
api "${header[@]}" 'http://localhost:8080/api/v1/search?q=Smoke' | grep -q 'ACTIVITY'
api "${header[@]}" "http://localhost:8080/api/v1/activities?itemId=$item_id" | grep -q 'PROGRESS_CHANGED'
api "${header[@]}" "http://localhost:8080/api/v1/activities?itemId=$item_id&from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z" | grep -q 'PROGRESS_CHANGED'
api "${header[@]}" http://localhost:8080/api/v1/statistics | grep -q 'completedItems'
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
