// Linux needs a display: `xvfb-run -a pnpm test:e2e` where there is none.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { _electron, test as base } from "@playwright/test";
import type { ElectronApplication, Page, TestInfo } from "@playwright/test";
import { withTimeout } from "es-toolkit";

import { killApp, readProcess } from "./process-tree.ts";
import type { AppProcesses } from "./process-tree.ts";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");

const unpackedExecutable = () => {
  const arm = process.arch === "arm64";

  switch (process.platform) {
    case "darwin": {
      return [
        arm ? "mac-arm64" : "mac",
        "Meru.app",
        "Contents",
        "MacOS",
        "Meru",
      ];
    }
    case "win32": {
      return [arm ? "win-arm64-unpacked" : "win-unpacked", "Meru.exe"];
    }
    case "linux": {
      // electron-builder names the Linux executable after the package.
      return [arm ? "linux-arm64-unpacked" : "linux-unpacked", "meru"];
    }
    default: {
      throw new Error(
        `No unpacked app is known for ${process.platform}; set MERU_EXECUTABLE to one.`
      );
    }
  }
};

export const executablePath =
  process.env.MERU_EXECUTABLE ??
  path.join(repositoryRoot, "dist", "e2e", ...unpackedExecutable());

/** Only the e2e build honours `MERU_TEST_BACKGROUND`. */
const launchEnv = (): Record<string, string> => ({
  ...(Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined)
  ) as Record<string, string>),
  MERU_TEST_BACKGROUND: "1",
});

const userDataArgument = (userDataDir: string) =>
  `--user-data-dir=${userDataDir}`;

/** Arguments for any launch on this user data directory, the lock's scope. */
export const launchArgs = (userDataDir: string) => [
  userDataArgument(userDataDir),
  // An unpacked Linux build's chrome-sandbox lacks its setuid bit.
  ...(process.platform === "linux" ? ["--no-sandbox"] : []),
];

export const createUserDataDir = () =>
  mkdtemp(path.join(tmpdir(), "meru4-e2e-"));

/** Windows can hold a file a moment after its process has gone. */
export const removeUserDataDir = (dir: string) =>
  rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });

export interface SpawnedApp {
  /** Resolves with the exit code, or null when a signal ended it. */
  exited: Promise<number | null>;
  stdout: () => string;
  stderr: () => string;
}

const spawnOne = async (args: string[]) => {
  const child = spawn(executablePath, args, {
    env: launchEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "exit").then(() => child.exitCode);
  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf-8").on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf-8").on("data", (chunk: string) => {
    stderr += chunk;
  });

  const processes: AppProcesses = {
    root: child.pid === undefined ? undefined : await readProcess(child.pid),
    argument: args.find((arg) => arg.startsWith("--user-data-dir=")),
  };

  return {
    app: { exited, stdout: () => stdout, stderr: () => stderr },
    processes,
  };
};

const CLOSE_TIMEOUT_MS = 10_000;

/**
 * A close that hangs, as on a blocking dialog, or fails, as after a crash, is
 * not waited out: whatever is left is killed.
 */
const closeApp = async (app: ElectronApplication, processes: AppProcesses) => {
  await withTimeout(() => app.close(), CLOSE_TIMEOUT_MS).catch(() => false);
  await killApp(processes);
};

const saveFailure = async (app: ElectronApplication, testInfo: TestInfo) => {
  const tracePath = testInfo.outputPath("trace.zip");

  try {
    await app.context().tracing.stop({ path: tracePath });
    await testInfo.attach("trace", {
      path: tracePath,
      contentType: "application/zip",
    });
    await Promise.all(
      app
        .windows()
        .filter((window) => !window.isClosed())
        .map(async (window, index) => {
          const shotPath = testInfo.outputPath(`window-${index + 1}.png`);

          await window.screenshot({ path: shotPath });
          await testInfo.attach(`window ${index + 1}`, {
            path: shotPath,
            contentType: "image/png",
          });
        })
    );
  } catch (error) {
    // An app that died mid-test has nothing left to record.
    console.warn(`Kept no trace or screenshot: ${String(error)}`);
  }
};

interface AppFixtures {
  userDataDir: string;
  app: ElectronApplication;
  /** The shell window, once it has loaded. */
  shell: Page;
  /**
   * Starts the app outside Playwright, as a second instance or for a
   * diagnostic. Whatever it starts is ended at teardown, however the test ends.
   */
  spawnApp: (args: string[]) => Promise<SpawnedApp>;
}

export const test = base.extend<AppFixtures>({
  userDataDir: async ({}, use) => {
    const dir = await createUserDataDir();

    try {
      await use(dir);
    } finally {
      await removeUserDataDir(dir);
    }
  },
  app: async ({ userDataDir }, use, testInfo) => {
    const app = await _electron.launch({
      executablePath,
      args: launchArgs(userDataDir),
      env: launchEnv(),
    });
    const { pid } = app.process();
    const processes: AppProcesses = {
      root: pid === undefined ? undefined : await readProcess(pid),
      argument: userDataArgument(userDataDir),
    };

    try {
      await app.context().tracing.start({ screenshots: true, snapshots: true });
      await use(app);

      if (testInfo.status !== testInfo.expectedStatus) {
        await saveFailure(app, testInfo);
      }
    } finally {
      await closeApp(app, processes);
    }
  },
  shell: async ({ app }, use) => {
    const window = await app.firstWindow();

    await window.waitForLoadState("load");
    await use(window);
  },
  spawnApp: async ({ userDataDir }, use) => {
    const started: AppProcesses[] = [];

    try {
      await use(async (args) => {
        const { app, processes } = await spawnOne(args);

        // The `app` fixture's own processes carry the same argument, and are
        // its teardown's to end.
        started.push(
          processes.argument === userDataArgument(userDataDir)
            ? { ...processes, argument: undefined }
            : processes
        );

        return app;
      });
    } finally {
      await Promise.all(started.map((processes) => killApp(processes)));
    }
  },
});

export { expect } from "@playwright/test";
