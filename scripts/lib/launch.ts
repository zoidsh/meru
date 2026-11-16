import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

import electronPath from "electron";

import { repositoryRoot } from "./bundles.ts";

export interface LaunchArgs {
  profile: string;
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

const git = (...args: string[]) => {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf-8",
  });

  return result.status === 0 ? result.stdout.trim() : "";
};

/**
 * A linked worktree takes a profile named after its branch, so that its run
 * holds a single instance lock of its own beside the main checkout's.
 */
const defaultProfile = () => {
  const [gitDir, commonDir] = git(
    "rev-parse",
    "--path-format=absolute",
    "--git-dir",
    "--git-common-dir"
  ).split("\n");

  if (!(gitDir && commonDir) || gitDir === commonDir) {
    return "default";
  }

  const branch =
    git("symbolic-ref", "--quiet", "--short", "HEAD") ||
    path.basename(repositoryRoot);

  return branch.replaceAll(/[^\w.-]+/gu, "-");
};

export const parseLaunchArgs = (argv: string[]): LaunchArgs => {
  const { values, tokens } = parseArgs({
    args: argv,
    options: OPTIONS,
    strict: false,
    allowPositionals: true,
    tokens: true,
  });

  const electronArgs = tokens.flatMap((token) => {
    if (token.kind === "positional") {
      return [token.value];
    }

    if (token.kind === "option" && !(token.name in OPTIONS)) {
      return [
        token.value === undefined
          ? token.rawName
          : `${token.rawName}=${token.value}`,
      ];
    }

    return [];
  });

  return {
    profile:
      typeof values.profile === "string" ? values.profile : defaultProfile(),
    debugPort:
      typeof values["debug-port"] === "string"
        ? values["debug-port"]
        : undefined,
    background: values.background === true,
    electronArgs,
  };
};

export const userDataDirFor = (profile: string) =>
  path.join(repositoryRoot, ".meru", profile);

const DEBUG_PORT_TIMEOUT_MS = 15_000;

const DEBUG_PORT_POLL_MS = 100;

/**
 * Chromium writes the port it picked into the user data directory a moment
 * after it starts, and nothing else reports it.
 */
const printDebugPort = async (
  userDataDir: string,
  deadline = Date.now() + DEBUG_PORT_TIMEOUT_MS
): Promise<void> => {
  const file = path.join(userDataDir, "DevToolsActivePort");
  const contents = await readFile(file, "utf-8").catch(() => "");
  const [port] = contents.split("\n");

  if (port && /^\d+$/u.test(port)) {
    console.log(`Debug port: ${port} (http://127.0.0.1:${port}/json/version)`);

    return;
  }

  if (Date.now() > deadline) {
    console.log(`No debug port was written to ${file}`);

    return;
  }

  await sleep(DEBUG_PORT_POLL_MS);

  return printDebugPort(userDataDir, deadline);
};

export interface ElectronLaunch {
  appDir: string;
  args: LaunchArgs;
  env?: Record<string, string>;
}

export const launchElectron = async ({
  appDir,
  args,
  env,
}: ElectronLaunch): Promise<ChildProcess> => {
  const userDataDir = userDataDirFor(args.profile);

  // A killed run leaves its file behind, which reads exactly like a new one.
  if (args.debugPort === "0") {
    await rm(path.join(userDataDir, "DevToolsActivePort"), { force: true });
  }

  const child = spawn(
    // Outside Electron the package exports its binary's path, which its types
    // do not describe.
    electronPath as unknown as string,
    [
      appDir,
      `--user-data-dir=${userDataDir}`,
      ...(args.debugPort ? [`--remote-debugging-port=${args.debugPort}`] : []),
      ...args.electronArgs,
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        ...env,
        ...(args.background ? { MERU_BACKGROUND: "1" } : {}),
      },
    }
  );

  console.log(`Profile: ${args.profile} (${userDataDir}), pid ${child.pid}`);

  if (args.debugPort === "0") {
    await printDebugPort(userDataDir);
  }

  return child;
};

/** Asks Electron to quit, which lets Chromium flush its cookies, and waits. */
export const stopElectron = async (child: ChildProcess) => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const exited = once(child, "exit");

  child.kill("SIGTERM");
  await exited;
};
