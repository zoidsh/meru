import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { delay } from "es-toolkit";

import { expect, test } from "./lib/app.ts";

const run = promisify(execFile);

/** Through Launch Services, which needs no Automation grant. */
const frontmostPid = async () => {
  const { stdout: front } = await run("lsappinfo", ["front"]);
  const { stdout } = await run("lsappinfo", [
    "info",
    "-only",
    "pid",
    front.trim(),
  ]);
  const pid = /"?pid"?\s*=\s*(?<pid>\d+)/u.exec(stdout)?.groups?.pid;

  if (!pid) {
    throw new Error(`lsappinfo gave no pid: ${stdout}`);
  }

  return Number(pid);
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

  // Activation lands asynchronously.
  await delay(1000);
  expect(await frontmostPid()).not.toBe(app.process().pid);
});
