#!/usr/bin/env bash
# Symlinks `docs/` at the repository root to the private docs directory, which is
# gitignored here and absent on a fresh checkout.
#
# The docs are no longer a git repository to clone. They live in a synced
# directory outside any checkout, so one copy serves every worktree and edits
# reach other devices without a commit. Set MERU_DOCS_PATH to that directory.

set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)

link="$repo_root/docs"

if [ -e "$link" ] || [ -L "$link" ]; then
  echo "docs: $link already exists, nothing to do"

  exit 0
fi

docs_path="${MERU_DOCS_PATH:-}"

if [ -z "$docs_path" ]; then
  echo "docs: set MERU_DOCS_PATH to the docs directory, then run this again" >&2

  exit 1
fi

if [ ! -d "$docs_path" ]; then
  echo "docs: $docs_path is not a directory" >&2

  exit 1
fi

ln -s "$docs_path" "$link"

echo "docs: linked $link to $docs_path — read docs/README.md for what lives where"
