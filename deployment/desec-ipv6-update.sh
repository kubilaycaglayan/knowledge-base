#!/usr/bin/env bash
set -euo pipefail

: "${DESEC_DDNS_TOKEN:?DESEC_DDNS_TOKEN is required}"
: "${DESEC_ZONE:?DESEC_ZONE is required}"
: "${DESEC_SUBNAME:?DESEC_SUBNAME is required}"

command -v curl >/dev/null || { printf 'curl is required\n' >&2; exit 1; }
command -v jq >/dev/null || { printf 'jq is required\n' >&2; exit 1; }

api_base="https://desec.io/api/v1/domains/${DESEC_ZONE}/rrsets/${DESEC_SUBNAME}/AAAA/"
current_ipv6="$(curl --fail --ipv6 --silent --show-error https://checkipv6.dedyn.io/ | tr -d '[:space:]')"

if [[ ! "$current_ipv6" =~ : ]]; then
  printf 'deSEC update failed: address detector returned a non-IPv6 value\n' >&2
  exit 1
fi

response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT
existing_status="$(curl --silent --show-error --output "$response_file" --write-out '%{http_code}' \
  "$api_base" \
  -H "Authorization: Token $DESEC_DDNS_TOKEN")"

case "$existing_status" in
  200)
    existing_ipv6="$(jq -r '.records[0] // empty' "$response_file")"
    if [[ "$existing_ipv6" == "$current_ipv6" ]]; then
      printf 'deSEC AAAA unchanged: %s.%s -> %s\n' "$DESEC_SUBNAME" "$DESEC_ZONE" "$current_ipv6"
      exit 0
    fi
    curl --fail --silent --show-error -X PATCH "$api_base" \
      -H "Authorization: Token $DESEC_DDNS_TOKEN" \
      -H 'Content-Type: application/json' \
      --data "{\"records\":[\"$current_ipv6\"],\"ttl\":60}" >/dev/null
    ;;
  404)
    curl --fail --silent --show-error -X POST \
      "https://desec.io/api/v1/domains/${DESEC_ZONE}/rrsets/" \
      -H "Authorization: Token $DESEC_DDNS_TOKEN" \
      -H 'Content-Type: application/json' \
      --data "{\"subname\":\"$DESEC_SUBNAME\",\"type\":\"AAAA\",\"ttl\":60,\"records\":[\"$current_ipv6\"]}" >/dev/null
    ;;
  *)
    printf 'deSEC update failed: GET returned HTTP %s\n' "$existing_status" >&2
    cat "$response_file" >&2
    exit 1
    ;;
esac

printf 'deSEC AAAA updated: %s.%s -> %s\n' "$DESEC_SUBNAME" "$DESEC_ZONE" "$current_ipv6"
