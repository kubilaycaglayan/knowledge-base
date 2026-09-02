#!/usr/bin/env bash
set -euo pipefail

fail() { printf 'Deployment preflight failed: %s\n' "$1" >&2; exit 1; }

: "${DOMAIN:?Set DOMAIN to the deployed hostname}"
: "${JWT_SECRET:?Set JWT_SECRET to a random value}"
: "${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD to a strong value}"
: "${CLOUDFLARE_TUNNEL_TOKEN:?Set CLOUDFLARE_TUNNEL_TOKEN to the tunnel token}"

[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || fail 'DOMAIN must be a hostname without a scheme, path, or port'
[[ "$DOMAIN" != 'localhost' && "$DOMAIN" != 'example.com' ]] || fail 'DOMAIN must be the real production hostname'
(( ${#JWT_SECRET} >= 32 )) || fail 'JWT_SECRET must be at least 32 characters'
[[ "$POSTGRES_PASSWORD" != replace-with-* && -n "$POSTGRES_PASSWORD" ]] || fail 'POSTGRES_PASSWORD must be replaced with a real value'
[[ "$CLOUDFLARE_TUNNEL_TOKEN" != replace-with-* && -n "$CLOUDFLARE_TUNNEL_TOKEN" ]] || fail 'CLOUDFLARE_TUNNEL_TOKEN must be replaced with the real tunnel token'
case ",${CORS_ORIGINS:-}," in
  *,"https://${DOMAIN}",*) ;;
  *) fail "CORS_ORIGINS must include https://${DOMAIN}" ;;
esac

command -v docker >/dev/null 2>&1 || fail 'Docker is not installed or not on PATH'
docker info >/dev/null 2>&1 || fail 'Docker daemon is not available'
command -v getent >/dev/null 2>&1 || fail 'getent is required to verify DNS resolution'
getent hosts "$DOMAIN" >/dev/null || fail "DOMAIN does not resolve: $DOMAIN"

docker volume inspect knowledge-base_know-db >/dev/null 2>&1 || fail 'Production database volume knowledge-base_know-db does not exist'
docker compose -f docker-compose.yml -f docker-compose.production.yml -f docker-compose.cloudflare.yml config >/dev/null || fail 'Docker Compose production configuration is invalid'
docker run --rm -v "$PWD/deployment/Caddyfile.cloudflare:/etc/caddy/Caddyfile:ro" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile >/dev/null || fail 'Caddy configuration is invalid'

printf 'Deployment preflight passed for %s.\n' "$DOMAIN"
