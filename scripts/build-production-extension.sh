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

version="$(node - <<'NODE'
const fs = require('fs');
const paths = [
  'chrome-extension/wxt.config.ts',
  'chrome-extension/package.json',
  'chrome-extension/package-lock.json',
];
const source = fs.readFileSync(paths[0], 'utf8');
const match = source.match(/version:\s*"(\d+)\.(\d+)\.(\d+)"/);
if (!match) throw new Error('Could not find a stable extension version');
const next = `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
for (const path of paths) {
  const current = fs.readFileSync(path, 'utf8');
  let updated;
  if (path.endsWith('.ts')) {
    updated = current.replace(/version:\s*"\d+\.\d+\.\d+"/, `version: "${next}"`);
  } else {
    const versionPattern = /("version"\s*:\s*")\d+\.\d+\.\d+("\s*,?)/;
    updated = current.replace(versionPattern, `$1${next}$2`);
    if (path.endsWith('package-lock.json')) updated = updated.replace(versionPattern, `$1${next}$2`);
  }
  if (updated === current) throw new Error(`Could not update version in ${path}`);
  fs.writeFileSync(path, updated);
}
process.stdout.write(next);
NODE
)"

echo "Building Knowledge Base extension release ${version} for ${api_base}..."
(cd "$repo_root/chrome-extension" && npm ci && npm run build:prod)
manifest="$repo_root/chrome-extension/.output/chrome-mv3/manifest.json"
release_dir="$repo_root/chrome-extension/.output/releases"
test -f "$manifest" || { echo 'Production extension manifest was not generated.' >&2; exit 1; }
manifest_version="$(node -e 'const fs=require("fs"); const m=JSON.parse(fs.readFileSync(process.argv[1])); if (m.optional_host_permissions || m.host_permissions.some(p => p.includes("*/*"))) process.exit(2); process.stdout.write(m.version)' "$manifest")" || { echo 'Production extension manifest contains unsafe permissions.' >&2; exit 1; }
[[ "$manifest_version" == "$version" ]] || { echo 'Production extension version drift detected.' >&2; exit 1; }
mkdir -p "$release_dir"
archive="$release_dir/knowledge-base-chrome-extension-${version}.zip"
[[ ! -e "$archive" ]] || { echo "Refusing to overwrite existing release: $archive" >&2; exit 1; }
(cd "$repo_root/chrome-extension/.output/chrome-mv3" && zip -qr "$archive" .)
unzip -tq "$archive"
echo "Production extension artifact: $repo_root/chrome-extension/.output/chrome-mv3"
echo "Chrome Web Store package: $archive"
