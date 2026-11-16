import { parseArgs } from "node:util";

export interface LaunchArgs {
  /** Set when `--profile` was given; otherwise the caller picks the default. */
  profile: string | undefined;
  debugPort: string | undefined;
  /** Everything not declared here, for Electron and Chromium as typed. */
  electronArgs: string[];
}

const OPTIONS = {
  profile: { type: "string" },
  "debug-port": { type: "string" },
} as const;

/**
 * One directory under `.meru`, so a profile never names a path elsewhere, and
 * never a leading `-`, so `--profile --background` is no profile.
 */
const isSafeProfileName = (name: string) =>
  /^[\w.][\w.-]*$/u.test(name) && name !== "." && name !== "..";

export const parseLaunchArgs = (argv: readonly string[]): LaunchArgs => {
  const { values, tokens } = parseArgs({
    args: [...argv],
    options: OPTIONS,
    strict: false,
    allowPositionals: true,
    tokens: true,
  });

  const electronArgs = tokens.flatMap((token) => {
    if (token.kind === "positional") {
      return [token.value];
    }

    if (token.kind !== "option" || token.name in OPTIONS) {
      return [];
    }

    return [
      token.value === undefined
        ? token.rawName
        : `${token.rawName}=${token.value}`,
    ];
  });

  const { profile, "debug-port": debugPort } = values;

  if (
    profile !== undefined &&
    (typeof profile !== "string" || !isSafeProfileName(profile))
  ) {
    throw new Error(
      '--profile needs a single directory name of letters, digits, ".", "_" or "-", not starting with "-".'
    );
  }

  if (debugPort !== undefined && typeof debugPort !== "string") {
    throw new Error("--debug-port needs a port number.");
  }

  return {
    profile,
    debugPort,
    electronArgs,
  };
};

export interface GitCheckout {
  gitDir: string;
  commonDir: string;
  branch: string | undefined;
  toplevel: string;
}

/**
 * A linked worktree takes a profile named after its branch, or its folder when
 * detached, so that its run holds a single instance lock of its own beside the
 * main checkout's, which takes `default`.
 */
export const defaultProfileFor = (checkout: GitCheckout | undefined) => {
  if (!checkout || checkout.gitDir === checkout.commonDir) {
    return "default";
  }

  const name = (
    checkout.branch ??
    checkout.toplevel.split(/[/\\]/u).at(-1) ??
    ""
  )
    .replaceAll(/[^\w.-]+/gu, "-")
    .replace(/^\.+/u, "");

  return isSafeProfileName(name) ? name : "default";
};

/**
 * The exit code a launcher script ends with when Electron exits on its own:
 * Electron's, or a failure when a signal killed it, such as a crash.
 */
export const exitCodeFor = (
  code: number | null,
  signal: NodeJS.Signals | null
) => (signal ? 1 : (code ?? 1));
