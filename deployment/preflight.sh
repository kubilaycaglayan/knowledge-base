#!/usr/bin/env bash
set -euo pipefail

fail() { printf 'Deployment preflight failed: %s\n' "$1" >&2; exit 1; }

[[ "${COMPOSE_PROJECT_NAME:-}" == 'knowledge-base-production' ]] || fail 'COMPOSE_PROJECT_NAME must be knowledge-base-production'

missing_env=0
for env_name in DOMAIN JWT_SECRET POSTGRES_PASSWORD CLOUDFLARE_TUNNEL_TOKEN KNOW_API_BASE NEON_DATABASE_URL NEON_BACKUP_DATABASE_CONFIRM; do
  if [[ -z "${!env_name:-}" ]]; then
    printf '⚠️ Missing required production environment value: %s\n' "$env_name" >&2
    missing_env=1
  fi
done
(( missing_env == 0 )) || fail 'one or more required production environment values are missing'

[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || fail 'DOMAIN must be a hostname without a scheme, path, or port'
[[ "$DOMAIN" != 'localhost' && "$DOMAIN" != 'example.com' ]] || fail 'DOMAIN must be the real production hostname'
[[ "$KNOW_API_BASE" == "https://${DOMAIN}/api/v1" ]] || fail 'KNOW_API_BASE must exactly match https://${DOMAIN}/api/v1'
(( ${#JWT_SECRET} >= 32 )) || fail 'JWT_SECRET must be at least 32 characters'
[[ "$POSTGRES_PASSWORD" != replace-with-* && -n "$POSTGRES_PASSWORD" ]] || fail 'POSTGRES_PASSWORD must be replaced with a real value'
[[ "$CLOUDFLARE_TUNNEL_TOKEN" != replace-with-* && -n "$CLOUDFLARE_TUNNEL_TOKEN" ]] || fail 'CLOUDFLARE_TUNNEL_TOKEN must be replaced with the real tunnel token'
for neon_url_name in NEON_DATABASE_URL; do
  neon_url="${!neon_url_name}"
  [[ "$neon_url" == postgresql://* || "$neon_url" == postgres://* ]] || fail "$neon_url_name must be a PostgreSQL URL"
  [[ "$neon_url" != *[[:space:]]* && "$neon_url" != *$'\n'* && "$neon_url" != *$'\r'* ]] || fail "$neon_url_name must not contain whitespace or line breaks"
done
[[ "$NEON_BACKUP_DATABASE_CONFIRM" == 1 ]] || fail 'NEON_BACKUP_DATABASE_CONFIRM must be 1 to authorize the confirmed Neon backup target'
case "$NEON_DATABASE_URL" in
  */[A-Za-z0-9_-]*|*/[A-Za-z0-9_-]*\?*) ;;
  *) fail 'NEON_DATABASE_URL must include a database name in its path' ;;
esac
case ",${CORS_ORIGINS:-}," in
  *,"https://${DOMAIN}",*) ;;
  *) fail "CORS_ORIGINS must include https://${DOMAIN}" ;;
esac

command -v docker >/dev/null 2>&1 || fail 'Docker is not installed or not on PATH'
command -v npm >/dev/null 2>&1 || fail 'npm is required to build the production extension'
docker info >/dev/null 2>&1 || fail 'Docker daemon is not available'
command -v getent >/dev/null 2>&1 || fail 'getent is required to verify DNS resolution'
getent hosts "$DOMAIN" >/dev/null || fail "DOMAIN does not resolve: $DOMAIN"

docker volume inspect knowledge-base_know-db >/dev/null 2>&1 || fail 'Production database volume knowledge-base_know-db does not exist'
docker compose --project-name knowledge-base-production -f docker-compose.yml -f docker-compose.production.yml -f docker-compose.cloudflare.yml config >/dev/null || fail 'Docker Compose production configuration is invalid'
docker run --rm -v "$PWD/deployment/Caddyfile.cloudflare:/etc/caddy/Caddyfile:ro" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile >/dev/null || fail 'Caddy configuration is invalid'

printf 'Deployment preflight passed for %s.\n' "$DOMAIN"
