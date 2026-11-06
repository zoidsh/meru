#!/usr/bin/env bash
# Exits 0 when a push to main needs no end-to-end run, saying why, and non-zero
# otherwise, including whenever an API call fails, so a doubt always runs them.
set -euo pipefail

sha=$1
repo=$GITHUB_REPOSITORY

commit=$(gh api "repos/$repo/commits/$sha")

# release.yml launches a version commit itself, at that version, on its way to
# publishing, so a run here would only repeat it.
subject=$(jq -r .commit.message <<< "$commit")
others=$(jq '[.files[] | select((.filename == "package.json" and .additions == 1 and .deletions == 1) or (.filename == "CHANGELOG.md" and .additions == 0) | not)] | length' <<< "$commit")
if [[ "$subject" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-beta\.[0-9]+)?$ ]] && [ "$others" = 0 ]; then
  echo "$sha is the version commit of $subject."
  exit 0
fi

# A squash of a pull request at main's tip has the tree its head was tested on.
# A fork, or a pull request that edits workflows, could have passed by changing
# what passing means, so neither counts.
pull=$(gh api "repos/$repo/commits/$sha/pulls" --jq "map(select(.merged_at != null and .base.ref == \"main\" and .head.repo.full_name == \"$repo\")) | first")
[ "$pull" != null ] && [ -n "$pull" ]
number=$(jq -r .number <<< "$pull")
head=$(jq -r .head.sha <<< "$pull")

head_tree=$(gh api "repos/$repo/git/commits/$head" --jq .tree.sha)
[ "$head_tree" = "$(jq -r .commit.tree.sha <<< "$commit")" ]

files=$(gh api --paginate "repos/$repo/pulls/$number/files?per_page=100" --jq '.[] | .filename, (.previous_filename // empty)')
if grep -q '^\.github/' <<< "$files"; then
  exit 1
fi

run=$(gh api "repos/$repo/actions/runs?head_sha=$head&event=pull_request&status=success&per_page=100" --jq '[.workflow_runs[] | select(.path == ".github/workflows/ci.yml")] | first | .id')
[ "$run" != null ] && [ -n "$run" ]

# A green run proves nothing about a job it skipped, as a docs-only pull request's
# does, so each platform has to have really passed there.
jobs=$(gh api "repos/$repo/actions/runs/$run/jobs?per_page=100" --jq '.jobs | map(select(.name | startswith("e2e (")))')
[ "$(jq 'map(select(.conclusion != "success")) | length' <<< "$jobs")" = 0 ]
for os in ubuntu windows; do
  [ "$(jq --arg os "$os" 'map(select(.name | contains($os))) | length' <<< "$jobs")" -gt 0 ]
done
if [ "$(jq 'map(select(.name | contains("macos"))) | length' <<< "$jobs")" = 0 ]; then
  state=$(gh api "repos/$repo/commits/$head/statuses" --jq 'map(select(.context == "e2e-macos-local")) | first | .state')
  [ "$state" = success ]
fi

echo "$sha has the tree of #$number's head $head, whose end-to-end jobs passed in run $run."
