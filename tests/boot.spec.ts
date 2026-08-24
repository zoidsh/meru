/*
 * Proves the app still starts. The renderer is served by the dev server in
 * playwright.config.ts; this launches the app against it and checks the
 * renderer actually painted.
 *
 * Needs a display. On a machine without one, wrap the command: `xvfb-run -a
 * bun run test:boot`. The -a matters, because it picks a free display number
 * rather than colliding on :99 with another run.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test as base, expect } from "@playwright/test";
import { _electron, type ElectronApplication, type Page } from "playwright";
import { rendererUrl } from "../playwright.config";

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
    const userDataDir = await mkdtemp(path.join(tmpdir(), "meru-boot-smoke-test-"));

    // No executablePath: letting Playwright resolve Electron itself is what
    // makes it preload its own script into the main process, which holds
    // `app.ready` until the connection is up. Passing a path skips that and
    // races the app.
    const app = await _electron.launch({
      args: [".", `--user-data-dir=${userDataDir}`],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MERU_RENDERER_URL: rendererUrl,
      } as Record<string, string>,
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
    }

    await app.close();

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

test("boots and renders appearance settings", async ({ app }) => {
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
