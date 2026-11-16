/** Marks a hook this repository wrote, which it may therefore rewrite. */
export const HOOK_MARKER = "Written by scripts/install-hooks.ts";

/*
 * Every worktree of a repository shares its hooks directory, so the hook names
 * no path: it runs lefthook from whichever worktree is committing. `lefthook
 * install` would instead write the absolute path of the worktree it ran in.
 */
export const hookScript = (hook: string) => `#!/bin/sh
# ${HOOK_MARKER}. Shared by every worktree of
# this repository, so it finds lefthook in whichever one is committing.
[ "$LEFTHOOK" = "0" ] && exit 0
dir="$(git rev-parse --show-toplevel)"
for bin in "$dir/node_modules/.bin/lefthook" "$(command -v lefthook)"; do
  if [ -n "$bin" ] && [ -x "$bin" ]; then
    exec "$bin" run ${hook} "$@"
  fi
done
echo "lefthook is not installed in $dir; run pnpm install there." >&2
exit 1
`;

export type HookAction =
  | "write"
  | "skip: CI"
  | "skip: lefthook hook already installed"
  | "skip: a hook of another tool is installed";

export const hookAction = ({
  ci,
  existing,
}: {
  ci: boolean;
  existing: string | undefined;
}): HookAction => {
  if (ci) {
    return "skip: CI";
  }

  if (existing === undefined || existing.includes(HOOK_MARKER)) {
    return "write";
  }

  return existing.includes("lefthook")
    ? "skip: lefthook hook already installed"
    : "skip: a hook of another tool is installed";
};
