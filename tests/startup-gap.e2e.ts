/*
 * TEMPORARY. Measures how long the main window goes without the `resize`
 * listener that lays the account views out, on a runner where Gmail actually
 * loads over the network. Reports only; it asserts nothing and is removed once
 * the number is read off the Windows job.
 */
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";

const meru = useApp();

test("reports when the window's resize listener is registered", async () => {
  const readState = () =>
    meru.app.evaluate(({ BrowserWindow }) => {
      const [window] = BrowserWindow.getAllWindows();

      return {
        uptime: process.uptime(),
        listeners: window ? window.listenerCount("resize") : -1,
        views: window ? window.contentView.children.length : -1,
      };
    });

  const first = await readState();

  console.log(`[e2e] first reading: ${JSON.stringify(first)}`);

  await expect
    .poll(async () => (await readState()).listeners, { timeout: 60_000 })
    .toBeGreaterThan(0);

  console.log(`[e2e] listener registered by: ${JSON.stringify(await readState())}`);
});
