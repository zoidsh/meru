/*
 * Proves the app still launches. Starts the built app, routes it to appearance
 * settings and checks the renderer actually painted.
 *
 * The harness that launches it, and the reasoning behind how, lives in
 * `tests/lib/app.ts`.
 */
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";

const meru = useApp();

test("launches and renders appearance settings", async () => {
  const rendererErrors: Error[] = [];

  meru.renderer.on("pageerror", (error) => {
    rendererErrors.push(error);
  });

  /*
   * Appearance settings is reachable without signing in, and it renders nothing
   * until the config arrives from the main process. Waiting for its title to
   * appear therefore proves the renderer bundle loaded, React mounted, routing
   * works and an IPC round trip completed — not merely that a window exists.
   */
  await meru.goto("/settings/appearance");

  await expect(meru.renderer.getByTestId("settings-title")).toHaveText("Appearance");

  /*
   * Reaches the main process over its own Node inspector, which the debugging
   * protocol alone cannot see. A window can be a debugging target while never
   * being shown, so whether the app put something on screen is only answerable
   * from here.
   */
  const windows = await meru.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => ({
      title: window.getTitle(),
      isVisible: window.isVisible(),
    })),
  );

  expect(windows).toHaveLength(1);
  expect(windows[0]?.isVisible).toBe(true);

  expect(rendererErrors.map((error) => error.stack ?? error.message)).toEqual([]);
});
