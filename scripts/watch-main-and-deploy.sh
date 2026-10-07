#!/usr/bin/env bash
set -euo pipefail

# Run from a dedicated production checkout. A scheduled user timer invokes this
# script; it deploys only the current main commit after its push verification
# workflow has completed successfully.
repo_root="${DEPLOY_CHECKOUT:?Set DEPLOY_CHECKOUT to the production main worktree}"
repo_root="$(cd "$repo_root" && pwd)"
cd "$repo_root"

state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/knowledge-base"
mkdir -p "$state_dir"
exec 9>"$state_dir/deploy-watch.lock"
flock -n 9 || exit 0

repository="${GITHUB_REPOSITORY:-kubilaycaglayan/knowledge-base}"
state_file="$state_dir/deployed-main-sha"
main_sha="$(git ls-remote origin refs/heads/main | awk 'NR == 1 {print $1}')"
[[ "$main_sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'Could not read main commit from origin' >&2; exit 1; }

last_deployed=""
[[ ! -f "$state_file" ]] || read -r last_deployed < "$state_file"
[[ "$main_sha" != "$last_deployed" ]] || exit 0

workflow_runs="$(curl --fail --silent --show-error \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "https://api.github.com/repos/${repository}/actions/workflows/verify.yml/runs?branch=main&event=push&per_page=100")"
verified_sha="$(printf '%s' "$workflow_runs" | DEPLOY_TARGET_SHA="$main_sha" node -e '
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => {
    const target = process.env.DEPLOY_TARGET_SHA;
    const runs = JSON.parse(input).workflow_runs || [];
    const verified = runs.some(run => run.head_sha === target && run.event === "push" && run.status === "completed" && run.conclusion === "success");
    if (verified) process.stdout.write(target);
  });
')"
[[ "$verified_sha" == "$main_sha" ]] || exit 0

test -f .env.production || { echo 'Missing .env.production in production checkout' >&2; exit 1; }
git fetch --no-tags origin main
git cat-file -e "$main_sha^{commit}"
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || { echo 'Production main worktree has local changes; refusing to deploy' >&2; exit 1; }
git switch main
git merge --ff-only "$main_sha"
test "$(git rev-parse HEAD)" = "$main_sha"

./scripts/production-web-deploy.sh
printf '%s\n' "$main_sha" > "$state_file"
chmod 600 "$state_file"
