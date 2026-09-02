#!/bin/sh
set -eu

while :; do
  if /usr/local/bin/desec-ipv6-update; then
    :
  else
    printf '%s\n' 'deSEC IPv6 update failed; retrying in 5 minutes' >&2
  fi
  sleep 300
done
