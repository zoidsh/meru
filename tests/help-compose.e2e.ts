/*
 * The compose window Help → Report Issue… opens.
 *
 * Every Gmail preload feature reads its switch from `process.argv`, which is
 * the renderer process's own command line: Electron appends a view's
 * `additionalArguments` to it when it starts the process. Gmail's own compose
 * pop-out is opened by the page through `window.open`, so Chromium hosts it in
 * the Gmail view's process and the pop-out finds the Gmail view's arguments
 * there without anyone passing them. `Gmail.createComposeWindow` builds a
 * `WorkspaceApp` of its own instead, which starts a process of its own, and
 * that process carries only what its view was created with.
 *
 * Asserted on the command line the OS reports for each view's process, because
 * that is exactly what the preload sees and nothing closer is reachable: a
 * sandboxed preload's `process.argv` is out of a test's reach, and
 * `getLastWebPreferences` does not report `additionalArguments`.
 *
 * Under a license, because the flag the report is about is Pro-gated: `Gmail`
 * only pushes it when `licenseKey.isValid`, so a free launch would have nothing
 * to look for in either process.
 */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { GMAIL_PRELOAD_ARGUMENTS } from "@meru/shared/gmail";
import { expect, test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { type MeruApp, useProApp } from "./lib/app";

const execFileAsync = promisify(execFile);

const ACCOUNT_ID = "5eeded00-0000-4000-8000-00000000ac01";

const meru = useProApp({
  accounts: [seedAccount({ id: ACCOUNT_ID, label: "Personal" })],
  "gmail.extendDarkTheme": true,
});

/** The command line a process was started with, as the OS reports it. */
async function readCommandLine(pid: number) {
  switch (process.platform) {
    case "linux":
      return (await readFile(`/proc/${pid}/cmdline`, "utf8")).replaceAll("\0", " ");
    case "darwin":
      return (await execFileAsync("ps", ["-o", "args=", "-p", String(pid)])).stdout;
    case "win32":
      return (
        await execFileAsync("powershell", [
          "-NoProfile",
          "-Command",
          `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
        ])
      ).stdout;
    default:
      throw new Error(`No way to read a command line on ${process.platform}`);
  }
}

/**
 * The renderer process ids of the child views of the window whose page is
 * `pageName`, or null while there is no such window. A view that has not
 * committed a page yet reports 0: the process it starts with is picked for the
 * URL it was asked for, and signed out, Gmail redirects to
 * accounts.google.com, an origin Chromium isolates, so the page commits in a
 * fresh process and the first one may already be gone.
 */
function readViewProcessIds(meru: MeruApp, pageName: string) {
  return meru.app.evaluate(({ BrowserWindow }, page) => {
    const window = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().includes(`/${page}`),
    );

    if (!window) {
      return null;
    }

    return (window.contentView.children as Electron.WebContentsView[]).map((view) =>
      view.webContents.getURL() ? view.webContents.getOSProcessId() : 0,
    );
  }, pageName);
}

test("Help → Report Issue… opens a compose window that carries the Gmail preload arguments", async () => {
  // The precondition, so a key that failed to validate reads as that and not as the bug.
  await expect
    .poll(async () => (await readViewProcessIds(meru, "main.html"))?.[0] ?? 0)
    .toBeGreaterThan(0);

  const gmailViewPid = (await readViewProcessIds(meru, "main.html"))?.[0] ?? 0;

  expect(await readCommandLine(gmailViewPid)).toContain(GMAIL_PRELOAD_ARGUMENTS.extendDarkTheme);

  expect(await meru.runMenuCommand("Report Issue…")).toBe(true);

  await expect
    .poll(async () => (await readViewProcessIds(meru, "workspace-app.html"))?.[0] ?? 0)
    .toBeGreaterThan(0);

  const composeViewPid = (await readViewProcessIds(meru, "workspace-app.html"))?.[0] ?? 0;

  expect(await readCommandLine(composeViewPid)).toContain(GMAIL_PRELOAD_ARGUMENTS.extendDarkTheme);
});
