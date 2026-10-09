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

# One empty image per tag. SOURCE_DATE_EPOCH gives each an explicit creation
# time a second apart, in the order listed, so the builds can run in parallel
# instead of sleeping between them.
tags=(
  aaaaaaaaaaa1 # oldest build, still used by a container
  diagnostic
  aaaaaaaaaaa2
  aaaaaaaaaaa3-dirty-20260101000000
  aaaaaaaaaaa4
  test-only
  aaaaaaaaaaa5
  aaaaaaaaaaa6
  perf-20261009010000-111111111111
  perf-20261009010001-222222222222
  perf-20261009010002-333333333333
  perf-20261009010003-444444444444
  perf-20261009010004-555555555555
)
pids=()
for index in "${!tags[@]}"; do
  printf 'FROM scratch\nLABEL knowledge-base-prune-check=%s\n' "${tags[$index]}" |
    docker build -q --build-arg "SOURCE_DATE_EPOCH=$((1700000000 + index))" \
      -t "$repo:${tags[$index]}" - >/dev/null &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
docker tag "$repo:aaaaaaaaaaa6" "$repo:latest"
container="$(docker create "$repo:aaaaaaaaaaa1" /nonexistent)"

KEEP_IMAGE_BUILDS=3 PRUNE_IMAGE_REPOS="$repo" "$repo_root/scripts/prune-production-images.sh"

actual="$(docker images "$repo" --format '{{.Tag}}' | sort | tr '\n' ' ')"
expected="aaaaaaaaaaa1 aaaaaaaaaaa4 aaaaaaaaaaa5 aaaaaaaaaaa6 diagnostic latest perf-20261009010002-333333333333 perf-20261009010003-444444444444 perf-20261009010004-555555555555 test-only "
if [[ "$actual" != "$expected" ]]; then
  echo "Image prune check failed: expected tags [$expected], got [$actual]" >&2
  exit 1
fi
echo 'Image prune check passed (keeps the newest builds, named tags, and in-use images)'
