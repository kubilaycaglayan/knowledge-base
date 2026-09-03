#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "${KNOW_API_BASE:-}" && -f "$repo_root/.env.production" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$repo_root/.env.production"
  set +a
fi
api_base="${KNOW_API_BASE:-}"
if [[ -z "$api_base" ]]; then
  echo 'Production extension build requires KNOW_API_BASE.' >&2
  exit 1
fi

echo "Building production Chrome extension for ${api_base}..."
(cd "$repo_root/chrome-extension" && npm ci && npm run build:prod)
manifest="$repo_root/chrome-extension/.output/chrome-mv3/manifest.json"
release_dir="$repo_root/chrome-extension/.output/releases"
test -f "$manifest" || { echo 'Production extension manifest was not generated.' >&2; exit 1; }
version="$(node -e 'const fs=require("fs"); const m=JSON.parse(fs.readFileSync(process.argv[1])); if (m.optional_host_permissions || m.host_permissions.some(p => p.includes("*/*"))) process.exit(2); process.stdout.write(m.version)' "$manifest")" || { echo 'Production extension manifest contains unsafe permissions.' >&2; exit 1; }
mkdir -p "$release_dir"
archive="$release_dir/knowledge-base-chrome-extension-${version}.zip"
(cd "$repo_root/chrome-extension/.output/chrome-mv3" && zip -qr "$archive" .)
unzip -tq "$archive"
echo "Production extension artifact: $repo_root/chrome-extension/.output/chrome-mv3"
echo "Chrome Web Store package: $archive"
