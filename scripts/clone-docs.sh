#!/usr/bin/env bash
# Clones the private docs repository into `docs/` at the repository root, which
# is gitignored here and absent on a fresh checkout.
#
# Set MERU_DOCS_PATH to keep the clone outside the checkout — several worktrees
# of this repository can then share one clone instead of cloning it each time.
# `docs/` becomes a symlink to that path.

set -euo pipefail

DOCS_REPO=zoidsh/meru-docs

repo_root=$(git rev-parse --show-toplevel)

link="$repo_root/docs"

if [ -e "$link" ] || [ -L "$link" ]; then
  echo "docs: $link already exists, nothing to do"

  exit 0
fi

clone_path="${MERU_DOCS_PATH:-$link}"

if [ ! -d "$clone_path" ]; then
  if ! GIT_TERMINAL_PROMPT=0 gh repo clone "$DOCS_REPO" "$clone_path" -- --quiet; then
    echo "docs: could not clone $DOCS_REPO — is gh authenticated for it?" >&2

    exit 1
  fi
fi

if [ "$clone_path" != "$link" ]; then
  ln -s "$clone_path" "$link"
fi

echo "docs: $DOCS_REPO is at $link — read docs/README.md for what lives where"
