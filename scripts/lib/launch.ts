import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import electronPath from "electron";

import { repositoryRoot } from "./bundles.ts";
import { defaultProfileFor } from "./launch-args.ts";
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

export const resolveProfile = (args: LaunchArgs) =>
  args.profile ?? defaultProfileFor(readGitCheckout());

export const userDataDirFor = (profile: string) =>
  path.join(repositoryRoot, ".meru", profile);

const isRunning = (child: ChildProcess) =>
  child.exitCode === null && child.signalCode === null;

const DEBUG_PORT_TIMEOUT_MS = 15_000;

const DEBUG_PORT_POLL_MS = 100;

/**
 * Chromium writes the port it picked into the user data directory a moment
 * after it starts, and nothing else reports it. Stops looking once the child
 * has exited.
 */
export const reportDebugPort = async (
  child: ChildProcess,
  userDataDir: string,
  deadline = Date.now() + DEBUG_PORT_TIMEOUT_MS
): Promise<void> => {
  if (!isRunning(child)) {
    return;
  }

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

  return reportDebugPort(child, userDataDir, deadline);
};

export interface ElectronLaunch {
  appDir: string;
  args: LaunchArgs;
  profile: string;
  env?: Record<string, string>;
}

/** Starts Electron at once, so the caller holds the child from the start. */
export const spawnElectron = ({
  appDir,
  args,
  profile,
  env,
}: ElectronLaunch) => {
  const userDataDir = userDataDirFor(profile);

  // A killed run leaves its file behind, which reads exactly like a new one.
  if (args.debugPort === "0") {
    rmSync(path.join(userDataDir, "DevToolsActivePort"), { force: true });
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

  console.log(`Profile: ${profile} (${userDataDir}), pid ${child.pid}`);

  return { child, userDataDir };
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
export const stopElectron = async (
  child: ChildProcess,
  timeoutMs = STOP_TIMEOUT_MS
) => {
  stoppedByScript.add(child);

  if (!isRunning(child)) {
    return;
  }

  const exited = once(child, "exit");

  child.kill("SIGTERM");

  const timedOut = await Promise.race([
    exited.then(() => false),
    sleep(timeoutMs).then(() => true),
  ]);

  if (timedOut && isRunning(child)) {
    console.log(`Electron (pid ${child.pid}) did not quit in time; killing it`);
    child.kill("SIGKILL");
    await exited;
  }
};
