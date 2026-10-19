#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Isolated containers only: no published ports, application volumes, or env files.
run_id="kb-homework-openapi-$(date +%s)-$$"
db="$run_id-db"
api="$run_id-api"
created_network=0
created_db=0
created_api=0
cleanup() {
  if (( created_api )); then docker rm -f "$api" >/dev/null; fi
  if (( created_db )); then docker rm -f "$db" >/dev/null; fi
  if (( created_network )); then docker network rm "$run_id" >/dev/null; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM
export POSTGRES_PASSWORD="$(openssl rand -hex 24)"
export JWT_SECRET="$(openssl rand -hex 32)"
export HOMEWORK_SOURCE_REVISION="$(git rev-parse HEAD)"
image="knowledge-base-homework-api:${HOMEWORK_SOURCE_REVISION:0:12}"
docker build -t "$image" backend >&2
docker network create "$run_id" >/dev/null
created_network=1
docker run -d --name "$db" --network "$run_id" \
  --tmpfs /var/lib/postgresql/data -e POSTGRES_PASSWORD \
  -e POSTGRES_USER=homework -e POSTGRES_DB=homework postgres:16-alpine >/dev/null
created_db=1
for ((attempt=0; attempt<60; attempt++)); do
  if docker exec "$db" pg_isready -h 127.0.0.1 -U homework -d homework >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$db" pg_isready -h 127.0.0.1 -U homework -d homework >/dev/null
docker run -d --name "$api" --network "$run_id" -e JWT_SECRET \
  -e "DATABASE_URL=jdbc:postgresql://$db:5432/homework" \
  -e DATABASE_USERNAME=homework -e "DATABASE_PASSWORD=$POSTGRES_PASSWORD" "$image" >/dev/null
created_api=1
for ((attempt=0; attempt<120; attempt++)); do
  if docker exec "$api" wget -qO- http://localhost:8080/actuator/health >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$api" wget -qO- http://localhost:8080/v3/api-docs |
  node mcp-server/normalize-contract.mjs
