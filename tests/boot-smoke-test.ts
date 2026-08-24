/*
 * Proves the app still starts. Launches it through `bun run dev:headless`,
 * attaches to it over the Chrome DevTools Protocol and checks the renderer
 * actually painted, then shuts it down.
 *
 * Needs Docker and Linux, because that is what `dev:headless` needs. Running
 * the app the same way developers do is the point: a separate CI-only launch
 * path would let `scripts/headless` rot without anything noticing.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ms } from "@meru/shared/ms";
import { type Subprocess, spawn } from "bun";
import { type Browser, chromium, type Page } from "playwright-core";

// Deliberately not the launcher's defaults, so a smoke test neither disturbs
// nor is disturbed by a `bun run dev:headless` already running on the machine.
const INSTANCE = "boot-smoke-test";
const CDP_PORT = process.env.MERU_CDP_PORT ?? "9333";

const CDP_URL = `http://127.0.0.1:${CDP_PORT}`;
const CONTAINER_NAME = `meru-headless-${INSTANCE}`;

const SCREENSHOT_PATH = path.join(process.cwd(), "boot-smoke-test.png");

// Generous because the first run downloads a multi-gigabyte container image
// before the app can start at all, so this covers the pull as well as the boot.
const BOOT_TIMEOUT = ms("10m");
const RENDER_TIMEOUT = ms("1m");
const SHUTDOWN_TIMEOUT = ms("10s");
const POLL_INTERVAL = ms("0.5s");

function log(message: string) {
  console.log(`[boot-smoke-test] ${message}`);
}

/**
 * The dev server treats Electron exiting as the user closing the app and exits
 * 0 itself, so its exit code says nothing about whether the app crashed. Only
 * the fact that it exited before the checks finished is meaningful.
 */
function watchForEarlyExit(devServer: Subprocess) {
  let hasExited = false;

  devServer.exited.then(() => {
    hasExited = true;
  });

  return () => hasExited;
}

async function waitForDebuggerPort(hasDevServerExited: () => boolean) {
  const deadline = Date.now() + BOOT_TIMEOUT;

  while (Date.now() < deadline) {
    if (hasDevServerExited()) {
      throw new Error("The dev server exited before the app exposed a debugging port.");
    }

    try {
      const response = await fetch(`${CDP_URL}/json/version`);

      if (response.ok) {
        return;
      }
    } catch {
      // Nothing is listening yet, which is the normal case while the image is
      // being pulled and the app is starting.
    }

    await Bun.sleep(POLL_INTERVAL);
  }

  throw new Error(`The app did not expose a debugging port within ${BOOT_TIMEOUT}ms.`);
}

/**
 * Every Gmail account and workspace app is a debugging target of its own, so
 * the app's own window has to be picked out by the page it loaded.
 */
async function waitForRendererPage(browser: Browser) {
  const deadline = Date.now() + RENDER_TIMEOUT;

  while (Date.now() < deadline) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const renderer = pages.find((page) => page.url().includes("main.html"));

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

async function logDebuggerTargets() {
  try {
    const response = await fetch(`${CDP_URL}/json/list`);
    const targets = (await response.json()) as { type: string; url: string }[];

    log("Debugging targets the app exposed:");

    for (const target of targets) {
      log(`  ${target.type} ${target.url}`);
    }
  } catch (error) {
    log(`Could not list debugging targets: ${error}`);
  }
}

/**
 * Removing the container is what actually stops the app. The dev server
 * spawned the launcher rather than the app itself, so killing the dev server
 * does not reliably reach the container the launcher started.
 */
async function stopApp(devServer: Subprocess) {
  await spawn(["docker", "rm", "--force", CONTAINER_NAME], {
    stdout: "ignore",
    stderr: "ignore",
  }).exited;

  // With the app gone the dev server exits by itself, so it is only signalled
  // when it does not. Killing it first would turn every clean shutdown into a
  // reported signal, which reads like a failure in the CI log.
  const hasStoppedOnItsOwn = await Promise.race([
    devServer.exited.then(() => true),
    Bun.sleep(SHUTDOWN_TIMEOUT).then(() => false),
  ]);

  if (hasStoppedOnItsOwn) {
    return;
  }

  devServer.kill();

  await devServer.exited;
}

const headlessHome = await mkdtemp(path.join(tmpdir(), "meru-boot-smoke-test-"));

// A fresh home every run, so a local run starts from the same empty config CI
// gets and cannot pass on state left behind by an earlier one.
const devServer = spawn(["bun", "run", "dev:headless"], {
  env: {
    ...process.env,
    MERU_INSTANCE: INSTANCE,
    MERU_CDP_PORT: CDP_PORT,
    MERU_HEADLESS_HOME: headlessHome,
  },
  stdout: "inherit",
  stderr: "inherit",
});

const hasDevServerExited = watchForEarlyExit(devServer);

let browser: Browser | undefined;
let renderer: Page | undefined;

try {
  log("Waiting for the app to start…");

  await waitForDebuggerPort(hasDevServerExited);

  browser = await chromium.connectOverCDP(CDP_URL);

  renderer = await waitForRendererPage(browser);

  const rendererErrors: Error[] = [];

  renderer.on("pageerror", (error) => {
    rendererErrors.push(error);
  });

  await assertRendererRendered(renderer);

  if (hasDevServerExited()) {
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

  await logDebuggerTargets();

  log(`Failed: ${error instanceof Error ? error.message : error}`);

  process.exitCode = 1;
} finally {
  await browser?.close();

  await stopApp(devServer);

  await rm(headlessHome, { recursive: true, force: true });
}
