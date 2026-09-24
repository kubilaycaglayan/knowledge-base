#!/usr/bin/env bash
set -euo pipefail

# Exercises scripts/prune-production-images.sh against a throwaway image
# repository. It never touches knowledge-base-api or knowledge-base-web.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo="knowledge-base-prune-check-${BASHPID:-$$}"
container=""
cleanup() {
  [[ -n "$container" ]] && docker rm "$container" >/dev/null 2>&1 || true
  docker images "$repo" --format '{{.Repository}}:{{.Tag}}' | xargs -r docker rmi >/dev/null 2>&1 || true
}
trap cleanup EXIT

# One empty image per tag, built a second apart so creation times order them.
build() {
  printf 'FROM scratch\nLABEL knowledge-base-prune-check=%s\n' "$1" | docker build -q -t "$repo:$1" - >/dev/null
  sleep 1
}
build aaaaaaaaaaa1 # oldest build, still used by a container
build diagnostic
build aaaaaaaaaaa2
build aaaaaaaaaaa3-dirty-20260101000000
build aaaaaaaaaaa4
build test-only
build aaaaaaaaaaa5
build aaaaaaaaaaa6
docker tag "$repo:aaaaaaaaaaa6" "$repo:latest"
container="$(docker create "$repo:aaaaaaaaaaa1" /nonexistent)"

KEEP_IMAGE_BUILDS=3 PRUNE_IMAGE_REPOS="$repo" "$repo_root/scripts/prune-production-images.sh"

actual="$(docker images "$repo" --format '{{.Tag}}' | sort | tr '\n' ' ')"
expected="aaaaaaaaaaa1 aaaaaaaaaaa4 aaaaaaaaaaa5 aaaaaaaaaaa6 diagnostic latest test-only "
if [[ "$actual" != "$expected" ]]; then
  echo "Image prune check failed: expected tags [$expected], got [$actual]" >&2
  exit 1
fi
echo 'Image prune check passed (keeps the newest builds, named tags, and in-use images)'
