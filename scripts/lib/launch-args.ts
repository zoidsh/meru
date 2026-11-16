import { parseArgs } from "node:util";

export interface LaunchArgs {
  /** Set when `--profile` was given; otherwise the caller picks the default. */
  profile: string | undefined;
  debugPort: string | undefined;
  background: boolean;
  /** Everything not declared here, for Electron and Chromium as typed. */
  electronArgs: string[];
}

const OPTIONS = {
  profile: { type: "string" },
  "debug-port": { type: "string" },
  background: { type: "boolean" },
} as const;

/** One directory name under `.meru`: no separator, no `.` or `..`. */
export const isSafeProfileName = (name: string) =>
  /^[\w.-]+$/u.test(name) && name !== "." && name !== "..";

/*
 * Chromium reads a switch behind any run of dashes, and on Windows behind `/`
 * and in any letter case, so `-USER-DATA-DIR=` would still choose the directory.
 * Every argument is checked, those after `--` too, since they reach Electron.
 */
const USER_DATA_DIR_SWITCH = /^(?:-+|\/)user-data-dir(?:=|$)/iu;

export const parseLaunchArgs = (argv: readonly string[]): LaunchArgs => {
  if (argv.some((arg) => USER_DATA_DIR_SWITCH.test(arg))) {
    throw new Error(
      "--user-data-dir is decided by the profile; pass --profile <name> instead."
    );
  }

  const { values, tokens } = parseArgs({
    args: [...argv],
    options: OPTIONS,
    strict: false,
    allowPositionals: true,
    tokens: true,
  });

  const electronArgs: string[] = [];

  for (const token of tokens) {
    if (token.kind === "positional") {
      electronArgs.push(token.value);
    } else if (token.kind === "option") {
      if (token.name in OPTIONS) {
        const isMissingValue =
          token.value === undefined ||
          (token.inlineValue === false && token.value.startsWith("-"));

        if (
          OPTIONS[token.name as keyof typeof OPTIONS].type === "string" &&
          isMissingValue
        ) {
          throw new Error(`--${token.name} needs a value.`);
        }
      } else {
        electronArgs.push(
          token.value === undefined
            ? token.rawName
            : `${token.rawName}=${token.value}`
        );
      }
    }
  }

  const profile =
    typeof values.profile === "string" ? values.profile : undefined;

  if (profile !== undefined && !isSafeProfileName(profile)) {
    throw new Error(
      `--profile ${JSON.stringify(profile)} is not a single directory name of letters, digits, ".", "_" or "-".`
    );
  }

  const debugPort =
    typeof values["debug-port"] === "string" ? values["debug-port"] : undefined;

  if (debugPort !== undefined && !/^\d+$/u.test(debugPort)) {
    throw new Error(
      `--debug-port ${JSON.stringify(debugPort)} is not a port number.`
    );
  }

  return {
    profile,
    debugPort,
    background: values.background === true,
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
 * The exit code a launcher script ends with when Electron exits: Electron's own,
 * or a failure when a signal the script did not send killed it, such as a crash.
 */
export const exitCodeFor = (
  code: number | null,
  signal: NodeJS.Signals | null,
  stoppedByScript: boolean
) => {
  if (stoppedByScript) {
    return 0;
  }

  if (signal) {
    return 1;
  }

  return code ?? 1;
};
