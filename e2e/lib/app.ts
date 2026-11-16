// Linux needs a display: `xvfb-run -a pnpm test:e2e` where there is none.
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { _electron, test as base } from "@playwright/test";
import type { ElectronApplication, Page, TestInfo } from "@playwright/test";
import { delay, withTimeout } from "es-toolkit";

import { DEV_IDENTITY } from "../../packages/core/src/app-identity.ts";

const run = promisify(execFile);

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");

const { productName } = DEV_IDENTITY;

const unpackedExecutable = () => {
  const arm = process.arch === "arm64";

  switch (process.platform) {
    case "darwin": {
      return [
        arm ? "mac-arm64" : "mac",
        `${productName}.app`,
        "Contents",
        "MacOS",
        productName,
      ];
    }
    case "win32": {
      return [
        arm ? "win-arm64-unpacked" : "win-unpacked",
        `${productName}.exe`,
      ];
    }
    default: {
      // electron-builder names the Linux executable after the package.
      return [arm ? "linux-arm64-unpacked" : "linux-unpacked", "meru"];
    }
  }
};

const executablePath = path.join(
  repositoryRoot,
  "dist",
  "e2e",
  ...unpackedExecutable()
);

/** Only the e2e build honours `MERU_TEST_BACKGROUND`. */
const env = { ...process.env, MERU_TEST_BACKGROUND: "1" } as Record<
  string,
  string
>;

const launchArgs = (userDataDir: string) => [
  `--user-data-dir=${userDataDir}`,
  // An unpacked Linux build's chrome-sandbox lacks its setuid bit.
  ...(process.platform === "linux" ? ["--no-sandbox"] : []),
];

/**
 * Every process of an app carries its user data directory on its command
 * line, the helpers and the crash handler too, so the directory finds them
 * all, even after the main process has died.
 */
const killUnix = async (userDataDir: string, giveUpAt: number) => {
  const { stdout } = await run("ps", ["-A", "-ww", "-o", "pid=,args="], {
    maxBuffer: 64 * 1024 * 1024,
  });
  const left = stdout
    .split("\n")
    .filter((line) => line.includes(userDataDir))
    .map((line) => Number(line.trim().split(" ", 1)[0]));

  if (left.length === 0) {
    return;
  }

  if (Date.now() > giveUpAt) {
    throw new Error(`Processes ${left.join(", ")} outlived the test`);
  }

  for (const pid of left) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Gone in the meantime.
    }
  }

  await delay(100);
  await killUnix(userDataDir, giveUpAt);
};

/** Not yet run on Windows: the tree under each launched pid is killed. */
const killAll = async (userDataDir: string, pids: number[]) => {
  if (process.platform !== "win32") {
    await killUnix(userDataDir, Date.now() + 15_000);

    return;
  }

  await Promise.all(
    pids.map((pid) =>
      run("taskkill", ["/T", "/F", "/PID", String(pid)]).catch(() => false)
    )
  );
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
  /** The pids this test launched, for the teardown on Windows. */
  launched: number[];
  userDataDir: string;
  app: ElectronApplication;
  /** The shell window, once it has loaded. */
  shell: Page;
  /** Starts a second instance on the test's user data, outside Playwright. */
  spawnApp: () => { exited: Promise<number | null> };
}

export const test = base.extend<AppFixtures>({
  launched: async ({}, use) => {
    await use([]);
  },
  userDataDir: async ({ launched }, use) => {
    const dir = await mkdtemp(path.join(tmpdir(), "meru4-e2e-"));

    try {
      await use(dir);
    } finally {
      await killAll(dir, launched);
      // Windows can hold a file a moment after its process has gone.
      await rm(dir, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 200,
      });
    }
  },
  app: async ({ userDataDir, launched }, use, testInfo) => {
    const app = await _electron.launch({
      executablePath,
      args: launchArgs(userDataDir),
      env,
    });
    const { pid } = app.process();

    if (pid !== undefined) {
      launched.push(pid);
    }

    try {
      await app.context().tracing.start({ screenshots: true, snapshots: true });
      await use(app);

      if (testInfo.status !== testInfo.expectedStatus) {
        await saveFailure(app, testInfo);
      }
    } finally {
      // A close that hangs, as on a blocking dialog, is not waited out: the
      // user data directory's teardown kills whatever is left.
      await withTimeout(() => app.close(), 10_000).catch(() => false);
    }
  },
  shell: async ({ app }, use) => {
    const window = await app.firstWindow();

    await window.waitForLoadState("load");
    await use(window);
  },
  spawnApp: async ({ userDataDir, launched }, use) => {
    await use(() => {
      const child = spawn(executablePath, launchArgs(userDataDir), {
        env,
        stdio: "ignore",
      });

      if (child.pid !== undefined) {
        launched.push(child.pid);
      }

      return { exited: once(child, "exit").then(() => child.exitCode) };
    });
  },
});

export { expect } from "@playwright/test";
