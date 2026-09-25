/*
 * What a development run has to resolve before it starts anything, so that
 * several of them can run at once from several worktrees of this repository.
 *
 * Three things collide between two runs: the renderer's port, the single
 * instance lock Electron scopes to a user data directory, and Chromium's remote
 * debugging port. The pure halves of resolving all three live here, where they
 * are testable without a display or a git checkout.
 */
import path from "node:path";

export const DEFAULT_RENDERER_PORT = 3000;

/**
 * The renderer's port: `PORT` when something outside assigned one, otherwise the
 * port this repository has always used. Either way Vite is free to take the next
 * one up when it is taken, and the URL Electron loads comes from the server
 * rather than from this number.
 *
 * `PORT=0` is refused rather than passed on. Chromium reads a zero port as "pick
 * a free one", so a tool handing ports out could reasonably expect Vite to as
 * well, and Vite instead treats it as unset and serves on its own default —
 * which is a port this script never told Electron about.
 */
export function resolveRendererPort(port: string | undefined) {
  if (!port) {
    return DEFAULT_RENDERER_PORT;
  }

  const parsed = Number(port);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(
      `PORT is ${port}, which is not a port between 1 and 65535. Leave it unset to serve the renderer on ${DEFAULT_RENDERER_PORT}.`,
    );
  }

  return parsed;
}

/** What a profile is named after when its name would otherwise come out empty. */
const FALLBACK_PROFILE_NAME = "worktree";

const MAX_PROFILE_NAME_LENGTH = 64;

/**
 * A branch or directory name as a folder name under `.meru`.
 *
 * Branch names carry slashes, and everything else a ref may hold is fair game
 * for a path separator on some platform, so only letters, digits, dots, dashes
 * and underscores survive. A name is never left starting with a dot, which would
 * hide the profile from the listing of the one directory a developer goes to
 * look for it in.
 */
export function toProfileName(ref: string) {
  const name = ref
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, MAX_PROFILE_NAME_LENGTH)
    .replace(/[-.]+$/, "");

  return name || FALLBACK_PROFILE_NAME;
}

export type WorktreeState = {
  /** `git rev-parse --git-dir`. */
  gitDir: string;
  /** `git rev-parse --git-common-dir`, which is the same directory outside a linked worktree. */
  gitCommonDir: string;
  /** `git rev-parse --show-toplevel`. */
  toplevel: string;
  /** `git symbolic-ref --short HEAD`, and nothing on a detached HEAD. */
  branch: string | undefined;
};

/**
 * The profile a development run takes when it was given no `--profile`, or
 * nothing in the main checkout.
 *
 * A linked worktree gets one named after its branch, because the single instance
 * lock is scoped to the user data directory: two runs sharing the default
 * directory are not two apps, the second one hands its arguments to the first
 * and exits. The main checkout is left on the default directory, so that the
 * accounts signed in to a developer's own runs are still there after this.
 *
 * A detached HEAD is named after the worktree's folder instead, which is the
 * only name it has that a second worktree cannot also be using.
 */
export function resolveWorktreeProfile({ gitDir, gitCommonDir, toplevel, branch }: WorktreeState) {
  if (path.resolve(gitDir) === path.resolve(gitCommonDir)) {
    return undefined;
  }

  return toProfileName(branch || path.basename(toplevel));
}

/**
 * The port Chromium settled on, from the `DevToolsActivePort` file it writes
 * into the user data directory. Its first line is the port and its second the
 * browser target's path, which nothing here needs.
 *
 * Undefined rather than a throw for anything unreadable, because this is polled
 * while the file is being written: Chromium creates it and fills it in, so an
 * empty or half-written read is the ordinary case rather than a failure.
 */
export function parseDevToolsActivePort(contents: string) {
  const port = Number(contents.split("\n", 1)[0]);

  return Number.isInteger(port) && port > 0 ? port : undefined;
}

export type UserDataDirEnvironment = {
  platform: string;
  env: Record<string, string | undefined>;
  homeDir: string;
};

/**
 * Where Electron puts the user data directory when it is given no
 * `--user-data-dir`, which is where a run without a profile writes its
 * `DevToolsActivePort`.
 *
 * Mirrored here rather than asked of the app, since the port has to be read from
 * outside the process that chose it. `appName` is Electron's `app.getName()`,
 * which prefers `productName` over `name` in `package.json`.
 */
export function defaultUserDataDir(
  { platform, env, homeDir }: UserDataDirEnvironment,
  appName: string,
) {
  if (platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support", appName);
  }

  if (platform === "win32") {
    return path.join(env.APPDATA || path.join(homeDir, "AppData", "Roaming"), appName);
  }

  return path.join(env.XDG_CONFIG_HOME || path.join(homeDir, ".config"), appName);
}
