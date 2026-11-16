/*
 * The fixture every end-to-end test launches the packaged app through.
 *
 * Linux needs a display: `xvfb-run -a pnpm test:e2e` where there is none.
 */
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { _electron, test as base } from "@playwright/test";
import type { ElectronApplication, Page, TestInfo } from "@playwright/test";
import { withTimeout } from "es-toolkit";

import { killProcessTree, readProcessTree } from "./process-tree.ts";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");

/** Where electron-builder leaves the unpacked e2e build, per platform. */
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
      // Linux names the executable after the package, in lower case.
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

/**
 * The environment every launch gets. `MERU_TEST_BACKGROUND` keeps the app from
 * ever activating on macOS; only the e2e build honours it.
 */
export const launchEnv = (): Record<string, string> => ({
  ...(Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined)
  ) as Record<string, string>),
  MERU_TEST_BACKGROUND: "1",
});

/** Arguments for any launch on this user data directory, the lock's scope. */
export const launchArgs = (userDataDir: string) => [
  `--user-data-dir=${userDataDir}`,
  // An unpacked Linux build's chrome-sandbox lacks its setuid bit.
  ...(process.platform === "linux" ? ["--no-sandbox"] : []),
];

export const createUserDataDir = () =>
  mkdtemp(path.join(tmpdir(), "meru4-e2e-"));

/** Windows can hold a file a moment after its process has gone. */
export const removeUserDataDir = (dir: string) =>
  rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });

/**
 * Starts the app outside Playwright, as a second instance or for a diagnostic,
 * collecting its output. `stop` ends its whole tree if it is still running.
 */
export const spawnApp = (args: string[]) => {
  const child: ChildProcess = spawn(executablePath, args, {
    env: launchEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";

  child.stdout?.setEncoding("utf-8").on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.resume();

  const exited = (
    child.exitCode === null ? once(child, "exit") : Promise.resolve([])
  ).then(() => child.exitCode);

  return {
    exited,
    output: async () => {
      await exited;

      return stdout;
    },
    stop: async () => {
      if (child.pid !== undefined && child.exitCode === null) {
        await killProcessTree(await readProcessTree(child.pid));
      }
    },
  };
};

const CLOSE_TIMEOUT_MS = 10_000;

/**
 * Closes the app, then kills whatever of its tree is left, pass or fail. A
 * close that hangs, as with a blocking dialog, is not waited out.
 */
const closeApp = async (app: ElectronApplication) => {
  const { pid } = app.process();
  const tree = pid === undefined ? [] : await readProcessTree(pid);

  try {
    await withTimeout(() => app.close(), CLOSE_TIMEOUT_MS);
  } catch {
    // Whatever is left is killed below.
  }

  await killProcessTree(tree);
};

/** Traces and screenshots are kept for a failed test only. */
const saveFailure = async (app: ElectronApplication, testInfo: TestInfo) => {
  const tracePath = testInfo.outputPath("trace.zip");

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
};

interface AppFixtures {
  userDataDir: string;
  app: ElectronApplication;
  /** The shell window, once it has loaded. */
  shell: Page;
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
    try {
      await app.context().tracing.start({ screenshots: true, snapshots: true });
      await use(app);

      if (testInfo.status !== testInfo.expectedStatus) {
        await saveFailure(app, testInfo);
      }
    } finally {
      await closeApp(app);
    }
  },
  shell: async ({ app }, use) => {
    const window = await app.firstWindow();

    await window.waitForLoadState("load");
    await use(window);
  },
});

export { expect } from "@playwright/test";
