import { realpathSync } from "node:fs";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import {
  SHELL_URL,
  expect,
  findOverlayDocument,
  findPage,
  test,
  writeSettings,
} from "./lib/app.ts";
import type { StandIn } from "./lib/stand-in.ts";
import { DOWNLOAD_FILES, DOWNLOAD_LINKS } from "./lib/stand-in.ts";

/**
 * A path in one spelling, as main and the test may name it apart: past the
 * link macOS puts before the temporary folder, and with Windows' long names.
 */
const canonical = (file: string) => realpathSync.native(file);

/** Where the test build saves downloads in place of the system's folder. */
const systemFolder = (userDataDir: string) =>
  path.join(canonical(userDataDir), "Downloads");

/** What is in the folder, none while it is not there. */
const filesIn = async (folder: string) => {
  try {
    return await readdir(folder);
  } catch {
    return [];
  }
};

/** Gmail's stand-in at its page of files to download. */
const downloadsPage = async (app: ElectronApplication, standIn: StandIn) => {
  const gmail = await findPage(app, standIn.url);

  await gmail.goto(standIn.downloadsUrl);

  return gmail;
};

const downloadReport = (gmail: Page) =>
  gmail.getByRole("link", { name: DOWNLOAD_LINKS.small }).click();

const REPORT = DOWNLOAD_FILES.small.name;

/** The main window's visibility, as the system has it. */
const mainWindow = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(
      (candidate) => !candidate.getParentWindow()
    );

    return {
      visible: window?.isVisible() ?? false,
      minimized: window?.isMinimized() ?? false,
    };
  });

test("Open in the background starts Meru with its window hidden, its pages loading, until opening Meru again shows it", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeSettings(userDataDir, { openInBackground: true });

  const app = await launchApp();

  await findPage(app, SHELL_URL);
  await findPage(app, standIn.url);

  expect(await mainWindow(app)).toStrictEqual({
    visible: false,
    minimized: false,
  });

  // As a second launch, or a click on the Dock icon, would.
  await app.evaluate(({ app: electron }) => {
    electron.emit("second-instance");
  });

  await expect
    .poll(() => mainWindow(app))
    .toStrictEqual({ visible: true, minimized: false });
});

test("with no tray on Windows and Linux, Open in the background starts Meru minimized to the taskbar, never out of reach", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  test.skip(
    process.platform === "darwin",
    "macOS reaches a hidden window from the Dock"
  );
  await writeSettings(userDataDir, { openInBackground: true, tray: false });

  const app = await launchApp();

  await findPage(app, standIn.url);

  await expect
    .poll(() => mainWindow(app))
    .toStrictEqual({ visible: true, minimized: true });
});

test("a download is saved to the folder chosen in Settings", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const chosen = path.join(canonical(userDataDir), "Chosen");

  await mkdir(chosen);
  await writeSettings(userDataDir, { downloadsFolder: chosen });

  const app = await launchApp();
  const gmail = await downloadsPage(app, standIn);

  await downloadReport(gmail);

  await expect.poll(() => filesIn(chosen)).toStrictEqual([REPORT]);
  expect(await filesIn(systemFolder(userDataDir))).toStrictEqual([]);
});

test("with the chosen folder gone, a download is saved to the system's Downloads folder, a toast says so once, and the folder stays as chosen", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const chosen = path.join(canonical(userDataDir), "Chosen");

  await mkdir(chosen);
  await writeSettings(userDataDir, { downloadsFolder: chosen });

  const app = await launchApp();
  const overlay = await findOverlayDocument(app);
  const gmail = await downloadsPage(app, standIn);
  const toast = overlay
    .getByRole("region", { name: "Notifications" })
    .getByText("Saved to Downloads, since your chosen folder isn't available", {
      exact: true,
    });

  await rm(chosen, { recursive: true });
  await downloadReport(gmail);

  await expect(toast).toBeVisible();
  await expect
    .poll(() => filesIn(systemFolder(userDataDir)))
    .toStrictEqual([REPORT]);
  await expect(toast).toBeHidden();

  await downloadReport(gmail);
  await expect.poll(() => filesIn(systemFolder(userDataDir))).toHaveLength(2);
  await expect(toast).toBeHidden();

  expect(
    JSON.parse(
      await readFile(path.join(userDataDir, "settings.json"), "utf-8")
    ) as unknown
  ).toStrictEqual({ version: 1, downloadsFolder: chosen });
});
