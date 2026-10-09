#!/usr/bin/env bash
set -euo pipefail

# Removes old commit-tagged production images, keeping the newest
# KEEP_IMAGE_BUILDS (default 5) per repository, and old HARD-05 performance
# images, keeping KEEP_PERFORMANCE_IMAGE_BUILDS (default 3). Other named tags,
# including latest and test-only, are never candidates.
# Images still used by a container are kept: docker rmi refuses them without
# --force, which this script never passes.
keep="${KEEP_IMAGE_BUILDS:-5}"
keep_performance="${KEEP_PERFORMANCE_IMAGE_BUILDS:-3}"
if [[ ! "$keep" =~ ^[1-9][0-9]*$ ]]; then
  echo "KEEP_IMAGE_BUILDS must be a positive integer, got: $keep" >&2
  exit 1
fi
if [[ ! "$keep_performance" =~ ^[1-9][0-9]*$ ]]; then
  echo "KEEP_PERFORMANCE_IMAGE_BUILDS must be a positive integer, got: $keep_performance" >&2
  exit 1
fi
read -r -a repos <<<"${PRUNE_IMAGE_REPOS:-knowledge-base-api knowledge-base-web}"

for repo in "${repos[@]}"; do
  docker images "$repo" --format '{{.CreatedAt}}'$'\t''{{.Tag}}' |
    { grep -E $'\t''[0-9a-f]{12}(-dirty-[0-9]{14})?$' || true; } |
    sort -r |
    tail -n "+$((keep + 1))" |
    cut -f2 |
    while read -r tag; do
      if docker rmi "$repo:$tag" >/dev/null 2>&1; then
        echo "Removed old build $repo:$tag"
      else
        echo "Kept $repo:$tag (still used by a container)"
      fi
    done

  # HARD-05 local performance builds use a timestamp and source commit in a
  # dedicated namespace. Keep the newest few per image repository without
  # treating them as permanent named tags or mixing them with deployment tags.
  docker images "$repo" --format '{{.CreatedAt}}'$'\t''{{.Tag}}' |
    { grep -E $'\t''perf-[0-9]{14}-[0-9a-f]{12}$' || true; } |
    sort -r |
    tail -n "+$((keep_performance + 1))" |
    cut -f2 |
    while read -r tag; do
      if docker rmi "$repo:$tag" >/dev/null 2>&1; then
        echo "Removed old performance build $repo:$tag"
      else
        echo "Kept $repo:$tag (still used by a container)"
      fi
    done
done
