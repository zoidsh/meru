import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess, StdioOptions } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

import electronPath from "electron";
import { TimeoutError, withTimeout } from "es-toolkit";

import { repositoryRoot } from "./bundles.ts";
import { defaultProfileFor, parseLaunchArgs } from "./launch-args.ts";
import type { GitCheckout, LaunchArgs } from "./launch-args.ts";

const git = (...args: string[]) => {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf-8",
  });

  return result.status === 0 ? result.stdout.trim() : undefined;
};

const readGitCheckout = (): GitCheckout | undefined => {
  const [gitDir, commonDir, toplevel] = (
    git(
      "rev-parse",
      "--path-format=absolute",
      "--git-dir",
      "--git-common-dir",
      "--show-toplevel"
    ) ?? ""
  ).split("\n");

  if (!(gitDir && commonDir && toplevel)) {
    return;
  }

  return {
    gitDir,
    commonDir,
    toplevel,
    branch: git("symbolic-ref", "--quiet", "--short", "HEAD") || undefined,
  };
};

/** The script's arguments and the profile they pick; a bad one ends the script. */
export const readLaunchArgs = () => {
  try {
    const args = parseLaunchArgs(process.argv.slice(2));

    return {
      args,
      profile: args.profile ?? defaultProfileFor(readGitCheckout()),
    };
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
};

const userDataDirFor = (profile: string) =>
  path.join(repositoryRoot, ".meru", profile);

const isRunning = (child: ChildProcess) =>
  child.exitCode === null && child.signalCode === null;

export interface ElectronLaunch {
  appDir: string;
  args: LaunchArgs;
  profile: string;
  env?: Record<string, string>;
  stdio?: StdioOptions;
}

/** Starts Electron at once, so the caller holds the child from the start. */
export const spawnElectron = ({
  appDir,
  args,
  profile,
  env,
  stdio = "inherit",
}: ElectronLaunch) => {
  const userDataDir = userDataDirFor(profile);

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
      stdio,
      env: { ...process.env, ...env },
    }
  );

  console.log(`Profile: ${profile} (${userDataDir}), pid ${child.pid}`);

  return child;
};

const stoppedByScript = new WeakSet<ChildProcess>();

export const wasStoppedByScript = (child: ChildProcess) =>
  stoppedByScript.has(child);

const STOP_TIMEOUT_MS = 5000;

/**
 * Asks Electron to quit and waits, killing it outright if it has not gone in
 * time, as when a blocking dialog holds its main thread. On macOS and Linux
 * SIGTERM starts Electron's own quit, which lets Chromium flush its cookies; on
 * Windows Node has no such signal and SIGTERM ends the process at once.
 */
export const stopElectron = async (child: ChildProcess) => {
  stoppedByScript.add(child);

  if (!isRunning(child)) {
    return;
  }

  const exited = once(child, "exit");

  child.kill("SIGTERM");

  try {
    await withTimeout(() => exited, STOP_TIMEOUT_MS);
  } catch (error) {
    if (!(error instanceof TimeoutError)) {
      throw error;
    }

    console.log(`Electron (pid ${child.pid}) did not quit in time; killing it`);
    child.kill("SIGKILL");
    await exited;
  }
};
