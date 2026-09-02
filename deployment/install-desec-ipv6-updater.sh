#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install_dir=/etc/know
env_file="$install_dir/desec-ipv6.env"

if [[ "$(id -u)" -ne 0 ]]; then
  exec sudo --preserve-env=DESEC_DDNS_TOKEN "$0" "$@"
fi

if [[ -z "${DESEC_DDNS_TOKEN:-}" ]]; then
  read -rsp 'deSEC restricted token secret: ' DESEC_DDNS_TOKEN
  printf '\n'
fi
[[ "$DESEC_DDNS_TOKEN" != *$'\n'* && -n "$DESEC_DDNS_TOKEN" ]] || {
  printf 'A non-empty single-line deSEC token is required.\n' >&2
  exit 1
}

install -d -m 0750 "$install_dir"
install -m 0750 "$repo_root/deployment/desec-ipv6-update.sh" /usr/local/sbin/know-desec-ipv6-update

umask 077
tmp_env="$(mktemp "$install_dir/.desec-ipv6.env.XXXXXX")"
printf '%s\n' \
  'DESEC_ZONE=blaqc.space' \
  'DESEC_SUBNAME=tryknowledgebase' \
  "DESEC_DDNS_TOKEN=$DESEC_DDNS_TOKEN" > "$tmp_env"
chown root:root "$tmp_env"
chmod 0600 "$tmp_env"
mv -f "$tmp_env" "$env_file"

install -m 0644 "$repo_root/deployment/desec-ipv6-update.service" /etc/systemd/system/know-desec-ipv6-update.service
install -m 0644 "$repo_root/deployment/desec-ipv6-update.timer" /etc/systemd/system/know-desec-ipv6-update.timer
systemctl daemon-reload
systemctl enable --now know-desec-ipv6-update.timer
systemctl start know-desec-ipv6-update.service
systemctl --no-pager --full status know-desec-ipv6-update.timer
systemctl --no-pager --full status know-desec-ipv6-update.service
