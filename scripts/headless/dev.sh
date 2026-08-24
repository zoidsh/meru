#!/usr/bin/env bash
# Entry point for `bun run dev:headless`. Runs the dev server on the host and
# the app in a container, for machines that cannot run Electron directly.
set -euo pipefail

if [ "$(uname -s)" != "Linux" ]; then
  echo "dev:headless runs the app in a Linux container and only works on Linux." >&2
  echo "The container runs the Electron binary from node_modules, which on this" >&2
  echo "machine is built for $(uname -s)." >&2
  echo >&2
  echo "Run the app directly instead:" >&2
  echo >&2
  echo "    bun run dev" >&2
  exit 1
fi

if ! command -v docker > /dev/null; then
  echo "dev:headless needs Docker to run the app, and docker is not on PATH." >&2
  echo "Run 'bun run dev' instead on a machine with a display." >&2
  exit 1
fi

# Electron joins this with the path in node_modules/electron/path.txt, which is
# "electron" on Linux, so it resolves to the launcher sitting next to this file.
export ELECTRON_OVERRIDE_DIST_PATH="$PWD/scripts/headless"

exec bun run dev "$@"
