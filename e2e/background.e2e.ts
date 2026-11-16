import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { delay } from "es-toolkit";

import { expect, test } from "./lib/app.ts";

const run = promisify(execFile);

const frontmostPid = async () => {
  const { stdout } = await run("osascript", [
    "-e",
    'tell application "System Events" to get unix id of first process whose frontmost is true',
  ]);

  return Number(stdout.trim());
};

test("never comes to the front on macOS, even when told to", async ({
  app,
  shell,
}) => {
  test.skip(process.platform !== "darwin", "Activation is a macOS notion");

  await expect(shell.getByRole("banner", { name: "Title bar" })).toBeVisible();

  await app.evaluate(({ app: electronApp, BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.show();
      window.focus();
    }

    electronApp.focus({ steal: true });
  });

  // Activation lands asynchronously, so a stolen focus is given time to show.
  await delay(1000);
  expect(await frontmostPid()).not.toBe(app.process().pid);
});
