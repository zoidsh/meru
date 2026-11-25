import type { ElectronApplication } from "@playwright/test";

import { SHELL_URL, expect, findPage, test, writeSettings } from "./lib/app.ts";

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
