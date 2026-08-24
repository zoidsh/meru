/*
 * Proves the app still launches. Starts the built app, routes it to appearance
 * settings and checks the renderer actually painted.
 *
 * `bun run test:e2e` builds the app before running this, so there is nothing
 * to do first beyond having a display. On a machine without one, wrap the
 * command: `xvfb-run -a bun run test:e2e`. The -a matters, because it picks a
 * free display number rather than colliding on :99 with another run.
 *
 * That build is Linux only. Elsewhere, build the app for the platform and
 * point MERU_EXECUTABLE at what electron-builder leaves in dist.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test as base, expect } from "@playwright/test";
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
 * Quitting can hang, and Playwright's own close() takes no timeout until after
 * 1.62, so the process gets killed rather than left to stall the worker for its
 * whole teardown budget.
 */
async function closeApp(app: ElectronApplication) {
  const closed = await Promise.race([
    app.close().then(() => true),
    new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), CLOSE_TIMEOUT);
    }),
  ]).catch(() => false);

  if (!closed) {
    console.log(`[e2e] the app did not quit within ${CLOSE_TIMEOUT}ms; killing it`);

    app.process().kill("SIGKILL");
  }
}

const test = base.extend<{ app: ElectronApplication }>({
  // Playwright resolves a fixture's dependencies from its destructuring
  // pattern, so the empty one is the framework's contract for depending on
  // nothing, and it rejects a plain parameter in its place.
  // oxlint-disable-next-line no-empty-pattern
  app: async ({}, use, testInfo) => {
    /*
     * A user data directory of its own, for two reasons. The app takes a single
     * instance lock scoped to that directory and quits when it loses, so runs
     * sharing one cannot overlap — and several agents do work on this
     * repository at once. It is also where the config lives, so a fresh
     * directory is what makes a local run start from the same empty config CI
     * gets.
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
     */
    await writeFile(
      path.join(userDataDir, "config.json"),
      JSON.stringify({ "trial.expired": true }, null, "\t"),
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

    await use(app);

    const hasFailed = testInfo.status !== testInfo.expectedStatus;

    if (hasFailed) {
      const tracePath = testInfo.outputPath("trace.zip");

      await app.context().tracing.stop({ path: tracePath });

      testInfo.attachments.push({
        name: "trace",
        path: tracePath,
        contentType: "application/zip",
      });
    } else {
      await app.context().tracing.stop();
    }

    if (hasFailed) {
      /*
       * The renderer's own HTML. Gmail and workspace apps are separate views
       * painted above it by the compositor, so they come out as blank
       * rectangles here — that is the protocol, not a broken app.
       */
      const renderer = app.windows().find((window) => window.url().includes("main.html"));

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

      // Also to stdout, not only the attachments: a job that is killed for
      // running long never uploads its artifacts, and that is exactly the run
      // whose state is worth seeing.
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

    await closeApp(app);

    await rm(userDataDir, { recursive: true, force: true });
  },
});

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

test("launches and renders appearance settings", async ({ app }) => {
  const renderer = await findRendererWindow(app);

  const rendererErrors: Error[] = [];

  renderer.on("pageerror", (error) => {
    rendererErrors.push(error);
  });

  /*
   * Appearance settings is reachable without signing in, and it renders nothing
   * until the config arrives from the main process. Waiting for its title to
   * appear therefore proves the renderer bundle loaded, React mounted, routing
   * works and an IPC round trip completed — not merely that a window exists.
   *
   * Routing is hash based, so changing the fragment is what navigates.
   */
  const appearanceUrl = new URL(renderer.url());
  appearanceUrl.hash = "#/settings/appearance";

  await renderer.goto(appearanceUrl.href);

  await expect(renderer.getByTestId("settings-title")).toHaveText("Appearance");

  /*
   * Reaches the main process over its own Node inspector, which the debugging
   * protocol alone cannot see. A window can be a debugging target while never
   * being shown, so whether the app put something on screen is only answerable
   * from here.
   */
  const windows = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => ({
      title: window.getTitle(),
      isVisible: window.isVisible(),
    })),
  );

  expect(windows).toHaveLength(1);
  expect(windows[0]?.isVisible).toBe(true);

  expect(rendererErrors.map((error) => error.stack ?? error.message)).toEqual([]);
});
