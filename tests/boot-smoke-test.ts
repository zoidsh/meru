/*
 * Proves the app still starts. Builds the app, serves the renderer from a dev
 * server in this process, launches the app and checks the renderer actually
 * painted, then shuts it down.
 *
 * Needs a display. On a machine without one, wrap the command: `xvfb-run -a
 * bun run test:boot`. The -a matters, because it picks a free display number
 * rather than colliding on :99 with another run.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ms } from "@meru/shared/ms";
import { _electron, type ElectronApplication, type Page } from "playwright-core";
import { buildAppFiles, resetBuildDirectory, startRendererDevServer } from "../scripts/build";

const SCREENSHOT_PATH = path.join(process.cwd(), "boot-smoke-test.png");

// Generous because a fresh checkout downloads the Electron binary on the first
// require, so this covers that as well as the boot.
const BOOT_TIMEOUT = ms("5m");
const RENDER_TIMEOUT = ms("1m");
const POLL_INTERVAL = ms("0.5s");

function log(message: string) {
  console.log(`[boot-smoke-test] ${message}`);
}

/**
 * Every Gmail account and workspace app is a window of its own as far as
 * Playwright is concerned, so the app's own window has to be picked out by the
 * page it loaded. `firstWindow()` is not that window — it returns whichever
 * one appeared first, which is usually an account. Nor does asking whether a
 * page has a `BrowserWindow` separate them, because `BrowserWindow`
 * `fromWebContents` resolves a `WebContentsView` to the window that owns it.
 */
async function waitForRendererWindow(app: ElectronApplication) {
  const deadline = Date.now() + RENDER_TIMEOUT;

  while (Date.now() < deadline) {
    const renderer = app.windows().find((window) => window.url().includes("main.html"));

    if (renderer) {
      return renderer;
    }

    await Bun.sleep(POLL_INTERVAL);
  }

  throw new Error(`No window loaded the renderer within ${RENDER_TIMEOUT}ms.`);
}

/**
 * Appearance settings is reachable without signing in, and it renders nothing
 * until the config arrives from the main process. Waiting for its title to
 * appear therefore proves the renderer bundle loaded, React mounted, routing
 * works and an IPC round trip completed — not merely that a window exists.
 */
async function assertRendererRendered(renderer: Page) {
  // Routing is hash based, so changing the fragment is what navigates.
  const appearanceUrl = new URL(renderer.url());
  appearanceUrl.hash = "#/settings/appearance";

  await renderer.goto(appearanceUrl.href);

  const settingsTitle = renderer.getByTestId("settings-title");

  await settingsTitle.waitFor({ state: "visible", timeout: RENDER_TIMEOUT });

  const renderedTitle = (await settingsTitle.textContent())?.trim();

  if (renderedTitle !== "Appearance") {
    throw new Error(
      `Expected appearance settings to render, but the page is titled "${renderedTitle}".`,
    );
  }
}

/**
 * Reaches the main process over its own Node inspector, which the debugging
 * protocol alone cannot see. A window can be a debugging target while never
 * being shown, so whether the app put something on screen is only answerable
 * from here.
 */
async function assertWindowShown(app: ElectronApplication) {
  const windows = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => ({
      title: window.getTitle(),
      isVisible: window.isVisible(),
    })),
  );

  if (windows.length !== 1) {
    throw new Error(
      `Expected the app to own one window, but the main process reports ${windows.length}: ${JSON.stringify(windows)}.`,
    );
  }

  if (!windows[0]?.isVisible) {
    throw new Error("The app's window was never shown.");
  }
}

/**
 * Captures the renderer's own HTML. Gmail and workspace apps are separate
 * views painted above it by the compositor, so they come out as blank
 * rectangles here — that is the protocol, not a broken app.
 */
async function captureFailureScreenshot(renderer: Page | undefined) {
  if (!renderer) {
    return;
  }

  try {
    await renderer.screenshot({ path: SCREENSHOT_PATH });

    log(`Wrote a screenshot of the failure to ${SCREENSHOT_PATH}`);
  } catch (error) {
    log(`Could not screenshot the renderer: ${error}`);
  }
}

function logWindows(app: ElectronApplication | undefined) {
  if (!app) {
    return;
  }

  log("Windows the app had open:");

  for (const window of app.windows()) {
    log(`  ${window.url()}`);
  }
}

/*
 * A user data directory of its own, for two reasons. The app takes a single
 * instance lock scoped to that directory and quits when it loses, so runs
 * sharing one cannot overlap — and several agents do work on this repository at
 * once. It is also where the config lives, so a fresh directory is what makes a
 * local run start from the same empty config CI gets.
 */
const userDataDir = await mkdtemp(path.join(tmpdir(), "meru-boot-smoke-test-"));

await resetBuildDirectory();

// Vite takes the next free port when 3000 is busy and reports which it took,
// so concurrent runs get a dev server each.
const [, viteServer] = await Promise.all([
  buildAppFiles({ dev: true }),
  startRendererDevServer("renderer", 3000),
]);

const rendererUrl = viteServer.resolvedUrls?.local[0];

let app: ElectronApplication | undefined;
let renderer: Page | undefined;

try {
  if (!rendererUrl) {
    throw new Error("The renderer dev server started without resolving a URL.");
  }

  log("Waiting for the app to start…");

  // No executablePath: letting Playwright resolve Electron itself is what makes
  // it preload its own script into the main process, which holds `app.ready`
  // until the connection is up. Passing a path skips that and races the app.
  app = await _electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    cwd: process.cwd(),
    timeout: BOOT_TIMEOUT,
    env: {
      ...process.env,
      MERU_RENDERER_URL: rendererUrl,
    } as Record<string, string>,
  });

  // Launching proves nothing on its own: the debugging endpoint is announced
  // before the app's own code runs, so a main process that throws immediately
  // still launches successfully. The assertions below are what test the app.
  let hasAppClosed = false;

  app.on("close", () => {
    hasAppClosed = true;
  });

  renderer = await waitForRendererWindow(app);

  const rendererErrors: Error[] = [];

  renderer.on("pageerror", (error) => {
    rendererErrors.push(error);
  });

  await assertRendererRendered(renderer);

  await assertWindowShown(app);

  if (hasAppClosed) {
    throw new Error("The app exited while the smoke test was running.");
  }

  if (rendererErrors.length > 0) {
    for (const rendererError of rendererErrors) {
      log(`Uncaught renderer error: ${rendererError.stack ?? rendererError.message}`);
    }

    throw new Error(`The renderer threw ${rendererErrors.length} uncaught error(s) while booting.`);
  }

  log("The app booted and the renderer rendered.");
} catch (error) {
  await captureFailureScreenshot(renderer);

  logWindows(app);

  log(`Failed: ${error instanceof Error ? error.message : error}`);

  process.exitCode = 1;
} finally {
  try {
    await app?.close();
  } catch (error) {
    log(`Could not close the app: ${error}`);
  }

  await viteServer.close();

  await rm(userDataDir, { recursive: true, force: true });
}
