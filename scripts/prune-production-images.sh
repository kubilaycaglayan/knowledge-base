#!/usr/bin/env bash
set -euo pipefail

# Removes old commit-tagged production images, keeping the newest
# KEEP_IMAGE_BUILDS (default 5) per repository. Only the tags a production
# deployment creates (<12-hex commit> or <commit>-dirty-<UTC timestamp>) are
# candidates, so latest, test-only, and other named tags are never touched.
# Images still used by a container are kept: docker rmi refuses them without
# --force, which this script never passes.
keep="${KEEP_IMAGE_BUILDS:-5}"
if [[ ! "$keep" =~ ^[1-9][0-9]*$ ]]; then
  echo "KEEP_IMAGE_BUILDS must be a positive integer, got: $keep" >&2
  exit 1
fi
read -r -a repos <<<"${PRUNE_IMAGE_REPOS:-knowledge-base-api knowledge-base-web}"

for repo in "${repos[@]}"; do
  docker images "$repo" --format '{{.CreatedAt}}'$'\t''{{.Tag}}' |
    grep -E $'\t''[0-9a-f]{12}(-dirty-[0-9]{14})?$' |
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
done
