import { realpathSync } from "node:fs";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import {
  SHELL_URL,
  expect,
  findOverlayDocument,
  findPage,
  readState,
  test,
  writeSettings,
} from "./lib/app.ts";
import {
  openSection,
  openSettings,
  pageLine,
  switchNamed,
} from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";
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

  // The suite's X server runs no window manager, which alone can iconify a
  // window, so on Linux the window is shown, never hidden, and no more is
  // asserted.
  await expect
    .poll(() => mainWindow(app))
    .toMatchObject(
      process.platform === "linux"
        ? { visible: true }
        : { visible: true, minimized: true }
    );
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

/** Sets what the test build's save dialog answers: a file, or `null` to cancel. */
const answerSaveDialog = (app: ElectronApplication, answer: string | null) =>
  app.evaluate((_electron, file) => {
    (
      Reflect.get(globalThis, "meruTestSaveDialog") as { answer: string | null }
    ).answer = file;
  }, answer);

const saveDialogAsked = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      (Reflect.get(globalThis, "meruTestSaveDialog") as { asked: string[] })
        .asked
  );

test("Ask where to save each file asks through the save dialog at the name it would take, saves where it says, and a cancel leaves nothing", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const elsewhere = path.join(canonical(userDataDir), "Elsewhere");

  await mkdir(elsewhere);
  await writeSettings(userDataDir, { downloadsSaveAs: true });

  const app = await launchApp();
  const gmail = await downloadsPage(app, standIn);

  await answerSaveDialog(app, path.join(elsewhere, "minutes.pdf"));
  await downloadReport(gmail);

  await expect.poll(() => filesIn(elsewhere)).toStrictEqual(["minutes.pdf"]);

  await answerSaveDialog(app, null);
  await downloadReport(gmail);

  await expect.poll(() => saveDialogAsked(app)).toHaveLength(2);

  const asked = await saveDialogAsked(app);
  const { downloads } = await readState<{ downloads?: unknown[] }>(userDataDir);

  expect([
    asked.map((file) => path.basename(file)),
    await filesIn(elsewhere),
    await filesIn(systemFolder(userDataDir)),
    downloads,
  ]).toStrictEqual([
    [REPORT, REPORT],
    ["minutes.pdf"],
    [],
    [expect.anything()],
  ]);
});

/** The files the test build showed in their folder in place of the system. */
const shownInFolder = async (app: ElectronApplication) => {
  const files = await app.evaluate(
    () =>
      Reflect.get(globalThis, "meruTestDownloadFiles") as { shown: string[] }
  );

  return files.shown.map((file) => canonical(file));
};

test("Show files when done shows each finished download in its folder", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeSettings(userDataDir, { downloadsShowInFolder: true });

  const app = await launchApp();
  const gmail = await downloadsPage(app, standIn);

  await downloadReport(gmail);

  await expect
    .poll(() => shownInFolder(app))
    .toStrictEqual([path.join(systemFolder(userDataDir), REPORT)]);
});

/** `settings.json` as the app wrote it. */
const readSettings = async (userDataDir: string) =>
  JSON.parse(
    await readFile(path.join(userDataDir, "settings.json"), "utf-8")
  ) as Record<string, unknown>;

const openGeneral = async (app: ElectronApplication) => {
  const page = await openSettings(app);

  await openSection(page, "General");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("General");

  return page;
};

const FILE_MANAGER_SWITCH =
  {
    darwin: "Show files in Finder when done",
    win32: "Show files in File Explorer when done",
  }[process.platform as string] ?? "Show files in the file manager when done";

/** Each value the test build's login item was asked to take, in order. */
const loginItemCalls = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      (Reflect.get(globalThis, "meruTestLoginItem") as { calls: boolean[] })
        .calls
  );

/** Sets what the test build's folder picker answers: a folder, or `null` to cancel. */
const answerFolderPicker = (app: ElectronApplication, answer: string | null) =>
  app.evaluate((_electron, folder) => {
    (
      Reflect.get(globalThis, "meruTestFolderPicker") as {
        answer: string | null;
      }
    ).answer = folder;
  }, answer);

const folderPickerAsked = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      (Reflect.get(globalThis, "meruTestFolderPicker") as { asked: string[] })
        .asked
  );

const changeFolder = (page: Page) =>
  page.getByRole("button", {
    name: "Change where downloads are saved",
    exact: true,
  });

test.describe("the General page", () => {
  test("is first in the sidebar and the page Settings opens on, with Startup and Downloads and no scopes", async ({
    app,
  }) => {
    const page = await openSettings(app);
    const sections = page.getByRole("navigation", {
      name: "Settings sections",
    });

    await expect(sections.getByRole("button").nth(0)).toHaveText("General");
    await openSection(page, "General");
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Startup" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Downloads" })).toBeVisible();
    await expect(switchNamed(page, "Open at login")).toHaveCount(
      process.platform === "linux" ? 0 : 1
    );
  });

  test("Open at login sets the login item, which a development build only pretends to, and never writes a setting", async ({
    app,
    userDataDir,
  }) => {
    test.skip(process.platform === "linux", "Linux has no login item, as v3");

    const page = await openGeneral(app);
    const login = switchNamed(page, "Open at login");

    await expect(login).not.toBeChecked();
    await expect(login).toHaveAccessibleDescription(
      "This development build never opens at login."
    );
    await login.click();
    await expect(login).toBeChecked();
    await login.click();
    await expect(login).not.toBeChecked();

    expect(await loginItemCalls(app)).toStrictEqual([true, false]);
    await expect
      .poll(async () => {
        try {
          return await readSettings(userDataDir);
        } catch {
          return {};
        }
      })
      .not.toHaveProperty("openAtLogin");
  });

  test("each switch writes its setting, and the values survive a relaunch, Open in the background then starting Meru hidden", async ({
    launchApp,
    userDataDir,
  }) => {
    const app = await launchApp();
    const page = await openGeneral(app);

    for (const name of [
      "Open in the background",
      "Ask where to save each file",
      FILE_MANAGER_SWITCH,
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one switch after another
      await expect(switchNamed(page, name)).not.toBeChecked();
      // oxlint-disable-next-line no-await-in-loop -- one switch after another
      await switchNamed(page, name).click();
    }

    await expect
      .poll(() => readSettings(userDataDir))
      .toStrictEqual({
        version: 1,
        openInBackground: true,
        downloadsSaveAs: true,
        downloadsShowInFolder: true,
      });

    await app.close();

    const again = await launchApp();

    await findPage(again, SHELL_URL);
    expect(await mainWindow(again)).toStrictEqual({
      visible: false,
      minimized: false,
    });

    const reopened = await openGeneral(again);

    for (const name of [
      "Open in the background",
      "Ask where to save each file",
      FILE_MANAGER_SWITCH,
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one switch after another
      await expect(switchNamed(reopened, name)).toBeChecked();
    }
  });

  test("Change… picks the folder through the picker, opened where downloads go now, a cancel changes nothing, and a download lands there", async ({
    launchApp,
    standIn,
    userDataDir,
  }) => {
    const chosen = path.join(canonical(userDataDir), "Chosen");

    await mkdir(chosen);

    const app = await launchApp();
    const page = await openGeneral(app);

    await changeFolder(page).click();
    await expect.poll(() => folderPickerAsked(app)).toHaveLength(1);
    await expect(pageLine(page, systemFolder(userDataDir))).toBeVisible();

    await answerFolderPicker(app, chosen);
    await changeFolder(page).click();
    await expect(pageLine(page, chosen)).toBeVisible();

    await answerFolderPicker(app, null);
    await changeFolder(page).click();
    await expect.poll(() => folderPickerAsked(app)).toHaveLength(3);
    await expect(pageLine(page, chosen)).toBeVisible();

    const asked = await folderPickerAsked(app);

    // The system's folder is not made until a download goes there.
    expect(
      asked.map((folder) =>
        path.join(canonical(path.dirname(folder)), path.basename(folder))
      )
    ).toStrictEqual([
      systemFolder(userDataDir),
      systemFolder(userDataDir),
      chosen,
    ]);
    expect(await readSettings(userDataDir)).toStrictEqual({
      version: 1,
      downloadsFolder: chosen,
    });

    const gmail = await downloadsPage(app, standIn);

    await downloadReport(gmail);
    await expect.poll(() => filesIn(chosen)).toStrictEqual([REPORT]);
  });

  test("says a chosen folder that is gone is not available, and shows it as chosen", async ({
    launchApp,
    userDataDir,
  }) => {
    const gone = path.join(canonical(userDataDir), "Gone");

    await writeSettings(userDataDir, { downloadsFolder: gone });

    const app = await launchApp();
    const page = await openGeneral(app);

    await expect(pageLine(page, gone)).toBeVisible();
    await expect(changeFolder(page)).toHaveAccessibleDescription(
      `${gone} This folder isn't available, so downloads are saved to Downloads until it's back.`
    );
  });
});

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("the General page, light and dark, and with its folder gone", async ({
    launchApp,
    userDataDir,
  }) => {
    const app = await launchApp();
    const page = await openGeneral(app);

    for (const scheme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, scheme);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.screenshot({ path: shotPath("settings-general", scheme) });
    }

    await answerFolderPicker(
      app,
      path.join(canonical(userDataDir), "Projects", "Invoices")
    );
    await changeFolder(page).click();
    await expect(page.getByText("Invoices")).toBeVisible();

    for (const scheme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, scheme);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.screenshot({
        path: shotPath("settings-general-folder-gone", scheme),
      });
    }
  });
});
