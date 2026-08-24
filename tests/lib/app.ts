/*
 * The harness every end-to-end test launches through.
 *
 * `bun run test:e2e` builds the app before running them, so there is nothing to
 * do first beyond having a display. On a machine without one, wrap the command:
 * `xvfb-run -a bun run test:e2e`. The -a matters, because it picks a free
 * display number rather than colliding on :99 with another run.
 *
 * That build is Linux only. Elsewhere, build the app for the platform and point
 * MERU_EXECUTABLE at what electron-builder leaves in dist.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Config } from "@meru/shared/types";
import { expect, test, type TestInfo } from "@playwright/test";
import { _electron, type ElectronApplication, type Page } from "playwright";

// Where electron-builder leaves the unpacked app, per platform. macOS and
// Windows name it after productName, "Meru"; Linux lowercases it. Getting that
// case wrong is invisible on a Mac and on Windows, whose filesystems match it
// either way, and breaks nowhere until someone runs on a case-sensitive one.
const UNPACKED_PATHS: Record<string, string[]> = {
  darwin: ["mac-arm64", "Meru.app", "Contents", "MacOS", "Meru"],
  linux: ["linux-unpacked", "meru"],
  win32: ["win-unpacked", "Meru.exe"],
};

function resolveExecutablePath() {
  if (process.env.MERU_EXECUTABLE) {
    return process.env.MERU_EXECUTABLE;
  }

  const unpackedPath = UNPACKED_PATHS[process.platform];

  if (!unpackedPath) {
    throw new Error(
      `No unpacked app path is known for ${process.platform}. Set MERU_EXECUTABLE to the built app.`,
    );
  }

  return path.join(process.cwd(), "dist", ...unpackedPath);
}

const EXECUTABLE_PATH = resolveExecutablePath();

const CLOSE_TIMEOUT = 15_000;

const DIAGNOSTICS_TIMEOUT = 10_000;

function launchArguments(userDataDir: string) {
  const args = [`--user-data-dir=${userDataDir}`];

  // chrome-sandbox ships without its setuid bit outside an installed package,
  // so an unpacked Linux build cannot use the sandbox. The packaged apps on the
  // other platforms can, and are left alone.
  if (process.platform === "linux") {
    args.push("--no-sandbox");
  }

  // Hosted runners have no GPU worth using, and Chromium spends a while finding
  // that out for itself.
  if (process.env.CI) {
    args.push("--disable-gpu");
  }

  return args;
}

/**
 * Every Gmail account and workspace app is a window of its own as far as
 * Playwright is concerned, so the app's own window has to be picked out by the
 * page it loaded. `firstWindow()` is not that window — it returns whichever one
 * appeared first, which is usually an account. Nor does asking whether a page
 * has a `BrowserWindow` separate them, because `BrowserWindow.fromWebContents`
 * resolves a `WebContentsView` to the window that owns it.
 */
async function findRendererWindow(app: ElectronApplication) {
  await expect
    .poll(() => app.windows().some((window) => window.url().includes("main.html")))
    .toBe(true);

  return app.windows().find((window) => window.url().includes("main.html")) as Page;
}

type LaunchedApp = {
  app: ElectronApplication;
  /** Unset until the app has shown its window, which it may never do. */
  renderer: Page | undefined;
  userDataDir: string;
};

/** Resolves true when the work finishes in time, false when it runs over. */
async function withTimeout(work: Promise<unknown>, timeout: number) {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      work.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function launchApp(seedConfig: Partial<Config>): Promise<LaunchedApp> {
  /*
   * A user data directory of its own, for two reasons. The app takes a single
   * instance lock scoped to that directory and quits when it loses, so runs
   * sharing one cannot overlap — and several agents do work on this repository
   * at once. It is also where the config lives, so a fresh directory is what
   * makes a local run start from the same empty config CI gets.
   */
  const userDataDir = await mkdtemp(path.join(tmpdir(), "meru-e2e-"));

  /*
   * Startup validates the Pro trial against Meru's API before it creates any
   * window, and on failure waits on a native dialog that no one is here to
   * dismiss: the app stays up with no window, and even the main process stops
   * answering. `trial.validate` returns early on this key without calling
   * anything, so seeding it keeps the test off the network entirely.
   *
   * Linux and Windows only pass without this because the call happens to
   * succeed there, which makes a live third-party service part of the test on
   * every platform. That is the reason to seed rather than to retry.
   *
   * It also settles which entitlement the tests see: no license key and no
   * running trial is the free version, so every Pro-gated control is locked.
   */
  await writeFile(
    path.join(userDataDir, "config.json"),
    JSON.stringify({ "trial.expired": true, ...seedConfig }, null, "\t"),
  );

  // The built binary, not `electron .`: only a packaged app has isPackaged
  // true, which is what sends loadRenderer down its production loadFile
  // branch. Running the app the way it ships is the point.
  const app = await _electron.launch({
    executablePath: EXECUTABLE_PATH,
    args: launchArguments(userDataDir),
    cwd: process.cwd(),
  });

  // Started by hand rather than through the `trace` option, which only covers
  // contexts the runner creates itself, and this one is launched here.
  await app.context().tracing.start({ screenshots: true, snapshots: true, sources: true });

  return { app, renderer: undefined, userDataDir };
}

async function attachDiagnostics({ app, renderer }: LaunchedApp, testInfo: TestInfo) {
  /*
   * The renderer's own HTML. Gmail and workspace apps are separate views
   * painted above it by the compositor, so they come out as blank rectangles
   * here — that is the protocol, not a broken app.
   *
   * There may be no renderer at all: an app that came up and never showed a
   * window is one of the failures worth reporting on, not a reason to report
   * nothing.
   */
  if (renderer) {
    await testInfo.attach("renderer", {
      body: await renderer.screenshot(),
      contentType: "image/png",
    });
  }

  await testInfo.attach("windows", {
    body: app
      .windows()
      .map((window) => window.url())
      .join("\n"),
    contentType: "text/plain",
  });

  // Also to stdout, not only the attachments: a job that is killed for running
  // long never uploads its artifacts, and that is exactly the run whose state
  // is worth seeing.
  console.log(`[e2e] windows: ${JSON.stringify(app.windows().map((window) => window.url()))}`);

  const mainProcessWindows = await app
    .evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((window) => ({
        title: window.getTitle(),
        url: window.webContents.getURL(),
        isVisible: window.isVisible(),
        isLoading: window.webContents.isLoading(),
        crashed: window.webContents.isCrashed(),
      })),
    )
    .catch((error: Error) => `unreachable: ${error.message}`);

  console.log(`[e2e] main process: ${JSON.stringify(mainProcessWindows)}`);
}

/**
 * Capped, because the main process can stop answering while staying up, and
 * `evaluate` then never returns. Spending a hook's whole budget waiting costs
 * the trace and the teardown that come after it, which is more than the
 * diagnostics are worth.
 */
async function collectDiagnostics(launched: LaunchedApp, testInfo: TestInfo) {
  const attached = await withTimeout(
    attachDiagnostics(launched, testInfo),
    DIAGNOSTICS_TIMEOUT,
  ).catch((error: Error) => {
    console.log(`[e2e] could not collect diagnostics: ${error.message}`);

    return true;
  });

  if (!attached) {
    console.log(`[e2e] diagnostics did not finish within ${DIAGNOSTICS_TIMEOUT}ms`);
  }
}

/**
 * Quitting can hang, and Playwright's own close() takes no timeout until after
 * 1.62, so the process gets killed rather than left to stall the worker for its
 * whole teardown budget.
 */
async function closeApp(app: ElectronApplication) {
  const closed = await withTimeout(app.close(), CLOSE_TIMEOUT).catch(() => false);

  if (!closed) {
    console.log(`[e2e] the app did not quit within ${CLOSE_TIMEOUT}ms; killing it`);

    app.process().kill("SIGKILL");
  }
}

export type MeruApp = {
  readonly app: ElectronApplication;
  readonly renderer: Page;
  readonly userDataDir: string;
  /** Navigates the renderer to a hash route, such as `/settings/appearance`. */
  goto(route: string): Promise<void>;
  /** The config as it stands on disk, which is where the main process wrote it. */
  readConfig(): Promise<Partial<Config>>;
};

/**
 * Launches the app once for the file that calls this, and hands every test in
 * it the same window.
 *
 * A launch costs about a second, so this is not about wall clock. It is that a
 * file's tests are usually steps through one surface, and reading them as one
 * session beats relaunching between each. Anything that needs an app of its own
 * — a different seeded config, a restart — belongs in a file of its own.
 */
export function useApp(seedConfig: Partial<Config> = {}): MeruApp {
  let launched: LaunchedApp | undefined;

  let hasFailed = false;

  function current() {
    if (!launched) {
      throw new Error("The app has not been launched yet");
    }

    return launched;
  }

  // oxlint-disable-next-line no-empty-pattern
  test.beforeAll(async ({}, testInfo) => {
    launched = await launchApp(seedConfig);

    /*
     * Assigned before the window is looked for, not after. An app that starts
     * and never shows one — the trial dialog nobody is here to dismiss is how
     * that happens — makes this poll throw, and reporting on that failure and
     * cleaning up after it both need the handle to the app already running.
     *
     * Reported from in here too, because a hook that throws takes its file's
     * tests with it and `afterEach` never runs. That leaves this the only place
     * the state of an app that never came up is still there to be read.
     */
    try {
      launched.renderer = await findRendererWindow(launched.app);
    } catch (error) {
      hasFailed = true;

      await collectDiagnostics(current(), testInfo);

      throw error;
    }
  });

  // Playwright resolves which fixtures to set up from the destructuring
  // pattern, so the empty one is the framework's contract for depending on
  // nothing.
  // oxlint-disable-next-line no-empty-pattern
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) {
      return;
    }

    hasFailed = true;

    await collectDiagnostics(current(), testInfo);
  });

  // oxlint-disable-next-line no-empty-pattern
  test.afterAll(async ({}, testInfo) => {
    const { app, userDataDir } = current();

    try {
      // One trace covers the whole file, because one launch does. It is written
      // only when something in the file failed; a passing run has nothing worth
      // uploading.
      if (hasFailed) {
        const tracePath = testInfo.outputPath("trace.zip");

        await app.context().tracing.stop({ path: tracePath });

        await testInfo.attach("trace", { path: tracePath, contentType: "application/zip" });
      } else {
        await app.context().tracing.stop();
      }
    } finally {
      // Whatever the trace did. A file fails because the app is in a bad way,
      // which is exactly when stopping the trace throws — and leaving the app
      // running would take the next file's launch down with it.
      await closeApp(app);

      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  function currentRenderer() {
    const { renderer } = current();

    if (!renderer) {
      throw new Error("The app has not shown its window");
    }

    return renderer;
  }

  return {
    get app() {
      return current().app;
    },
    get renderer() {
      return currentRenderer();
    },
    get userDataDir() {
      return current().userDataDir;
    },
    async goto(route) {
      const renderer = currentRenderer();

      // Routing is hash based, so changing the fragment is what navigates. The
      // rest of the URL carries the accounts the main process handed over at
      // load, and dropping it would reload the app without them.
      const url = new URL(renderer.url());

      url.hash = `#${route}`;

      await renderer.goto(url.href);
    },
    async readConfig() {
      const configPath = path.join(current().userDataDir, "config.json");

      /*
       * Retried once. The config is written by replacing the file, so a read
       * landing between the two halves of that rename fails rather than
       * returning half a file — and on Windows it fails as a sharing violation.
       * A throw here would end a poll rather than let it come round again.
       */
      try {
        return JSON.parse(await readFile(configPath, "utf8"));
      } catch {
        return JSON.parse(await readFile(configPath, "utf8"));
      }
    },
  };
}
