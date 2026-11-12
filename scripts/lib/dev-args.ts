import path from "node:path";

export interface DevArgs {
  readonly profile: string | undefined;
  readonly background: boolean;
  /** Everything the dev script does not claim, passed to Electron as typed. */
  readonly electronArgs: string[];
}

export const splitArgs = (
  args: readonly string[],
  env = process.env
): DevArgs => {
  let profile: string | undefined;
  let background = env.MERU_BACKGROUND === "1";
  const electronArgs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--background") {
      background = true;
    } else if (arg === "--profile") {
      index += 1;
      profile = args[index];
      if (profile === undefined) {
        throw new Error("--profile needs a name");
      }
    } else if (arg?.startsWith("--profile=") === true) {
      profile = arg.slice("--profile=".length);
    } else if (arg !== undefined) {
      electronArgs.push(arg);
    }
  }

  return { background, electronArgs, profile };
};

/** A branch or folder name as a directory name under `.meru`: slashes and anything else a path could choke on become dashes. */
export const toProfileName = (ref: string): string =>
  ref
    .replaceAll(/[^\w.-]+/gu, "-")
    .replaceAll(/^[.-]+|[.-]+$/gu, "")
    .slice(0, 64) || "worktree";

export interface WorktreeState {
  readonly gitDir: string;
  readonly gitCommonDir: string;
  readonly toplevel: string;
  /** Empty on a detached HEAD. */
  readonly branch: string;
}

/**
 * The profile a run uses: the one named, else one per linked worktree, because Electron scopes its single instance lock to the user data directory and two runs sharing one are not two apps. The main checkout keeps the default directory, and so its signed-in profiles.
 */
export const resolveProfile = (
  named: string | undefined,
  worktree: WorktreeState
): string | undefined => {
  if (named !== undefined) {
    return toProfileName(named);
  }
  if (path.resolve(worktree.gitDir) === path.resolve(worktree.gitCommonDir)) {
    return undefined;
  }
  return toProfileName(worktree.branch || path.basename(worktree.toplevel));
};
