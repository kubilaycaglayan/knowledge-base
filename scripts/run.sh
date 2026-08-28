#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export JWT_SECRET="${JWT_SECRET:-development-jwt-secret-at-least-32-chars-long}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-dev-postgres-password}"

cd "$repo_root"

docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps

cat <<'EOF'

Know is available at:
  Web: http://localhost:3000 (Vite hot reload)
  API: http://localhost:3000/api/v1
  Health: http://localhost:8080/actuator/health
EOF
