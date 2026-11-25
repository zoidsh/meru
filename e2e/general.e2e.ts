import { realpathSync } from "node:fs";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import { pseudoText } from "#i18n/pseudo.ts";

import {
  SHELL_URL,
  expect,
  findOverlayDocument,
  findPage,
  readMenuLabel,
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
  if (process.platform === "linux") {
    await expect.poll(() => mainWindow(app)).toMatchObject({ visible: true });

    return;
  }

  // Electron's `isVisible()` on Windows is false for any minimized window,
  // shown or not, so reach is proven by opening Meru again restoring it.
  await expect
    .poll(() => mainWindow(app))
    .toStrictEqual({ visible: false, minimized: true });

  await app.evaluate(({ app: electron }) => {
    electron.emit("second-instance");
  });

  await expect
    .poll(() => mainWindow(app))
    .toStrictEqual({ visible: true, minimized: false });
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
    .getByText("Saved to Downloads because your folder isn't available.", {
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
  test("is first in the sidebar, with Language, Startup and Downloads and no scopes", async ({
    app,
  }) => {
    const page = await openSettings(app);
    const sections = page.getByRole("navigation", {
      name: "Settings sections",
    });

    await expect(sections.getByRole("button").nth(0)).toHaveText("General");
    await openSection(page, "General");
    await expect(page.getByRole("tablist")).toHaveCount(0);
    // The suite's build has the pseudo-language beside English, so its
    // Language row shows.
    await expect(page.getByRole("group", { name: "Language" })).toBeVisible();
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
      `${gone} This folder isn't available. Downloads go to Downloads until it's back.`
    );
  });
});

/** The tray's menu as last set or popped up, each item's label. */
const trayLabels = (app: ElectronApplication) =>
  app.evaluate(() => {
    const tray = Reflect.get(globalThis, "meruTestTray") as
      | {
          menu: { kind: string; label?: string }[];
          rightClick: () => void;
        }
      | undefined;

    if (process.platform !== "linux") {
      tray?.rightClick();
    }

    return (tray?.menu ?? []).flatMap((item) =>
      item.kind === "item" && item.label !== undefined ? [item.label] : []
    );
  });

const languageMenu = (page: Page, name = "Language") =>
  page.getByRole("combobox", { name, exact: true });

/** The language a page's root names. */
const pageLanguage = (page: Page) =>
  page.evaluate(() => document.documentElement.lang);

const savedSetting = async (userDataDir: string, key: string) => {
  const saved = await readSettings(userDataDir);

  return saved[key];
};

/** Named by its label and then what it reads, `summary` when given. */
const spellingButton = (page: Page, summary?: string) =>
  page.getByRole("button", {
    name: summary === undefined ? /^Spelling\b/u : `Spelling ${summary}`,
    exact: summary !== undefined,
  });

/** The languages a profile's session checks, as Chromium holds them. */
const checkedLanguages = (app: ElectronApplication, profileId: string) =>
  app.evaluate(
    ({ session }, partition) =>
      session.fromPartition(partition).getSpellCheckerLanguages(),
    `persist:${profileId}`
  );

test.describe("Language and Spelling", () => {
  test("a language chosen reaches the menu, the tray, the shell, its overlay and Settings at once, and System goes back to the system's", async ({
    launchApp,
    userDataDir,
  }) => {
    await writeSettings(userDataDir, { tray: true });

    const app = await launchApp();
    const shell = await findPage(app, SHELL_URL);
    const overlay = await findOverlayDocument(app);
    const page = await openGeneral(app);
    const english = await trayLabels(app);

    expect(english.length).toBeGreaterThan(0);
    await expect(languageMenu(page)).toContainText("System (English)");

    await languageMenu(page).click();
    await page.getByRole("option", { name: "Pseudo-English" }).click();

    await expect(
      page.getByRole("heading", { level: 1, name: pseudoText("General") })
    ).toBeVisible();
    await expect.poll(() => pageLanguage(page)).toBe("en-XA");
    await expect
      .poll(() => readMenuLabel(app, "app.settings"))
      .toBe(pseudoText("Settings…"));
    await expect
      .poll(() => trayLabels(app))
      .toStrictEqual(
        english.map((label) =>
          // The product name is a placeholder, never translated.
          label.replace(/^\S+/u, (word) => pseudoText(word))
        )
      );

    const downloads = shell.getByRole("button", {
      name: pseudoText("Downloads"),
      exact: true,
    });

    await expect.poll(() => pageLanguage(shell)).toBe("en-XA");
    await downloads.click();
    await expect(
      overlay.getByRole("dialog", { name: pseudoText("Downloads") })
    ).toBeVisible();
    await expect.poll(() => pageLanguage(overlay)).toBe("en-XA");
    await overlay.keyboard.press("Escape");

    await expect
      .poll(() => savedSetting(userDataDir, "language"))
      .toBe("en-XA");

    await languageMenu(page, pseudoText("Language")).click();
    await page.getByRole("option", { name: "Sýstém (English)" }).click();

    await expect(
      page.getByRole("heading", { level: 1, name: "General" })
    ).toBeVisible();
    await expect(
      shell.getByRole("button", { name: "Downloads", exact: true })
    ).toBeVisible();
    await expect
      .poll(() => readMenuLabel(app, "app.settings"))
      .toBe("Settings…");
    await expect.poll(() => trayLabels(app)).toStrictEqual(english);
  });

  test("a chosen language holds across a relaunch, the first paint already in it", async ({
    launchApp,
    userDataDir,
  }) => {
    await writeSettings(userDataDir, { language: "en-XA" });

    const app = await launchApp();
    const shell = await findPage(app, SHELL_URL);

    await expect.poll(() => pageLanguage(shell)).toBe("en-XA");
    await expect(
      shell.getByRole("button", { name: pseudoText("Downloads"), exact: true })
    ).toBeVisible();
    await expect
      .poll(() => readMenuLabel(app, "app.settings"))
      .toBe(pseudoText("Settings…"));
  });

  test("Spelling has no row on macOS, which checks spelling with its own", async ({
    app,
  }) => {
    test.skip(process.platform !== "darwin", "macOS alone");

    const page = await openGeneral(app);

    await expect(spellingButton(page)).toHaveCount(0);
  });

  test("Spelling adds languages to the profile's session at once, two quick toggles both holding, the system's always checked", async ({
    launchApp,
    standIn,
    userDataDir,
  }) => {
    test.skip(
      process.platform === "darwin",
      "macOS checks spelling with its own"
    );

    const app = await launchApp();

    await findPage(app, standIn.url);

    const state = await readState<{ profiles: { id: string }[] }>(userDataDir);
    const profileId = state.profiles[0]?.id ?? "";
    const page = await openGeneral(app);

    await expect(spellingButton(page, "System language")).toBeVisible();

    const system = await checkedLanguages(app, profileId);

    expect(system).toHaveLength(1);

    await spellingButton(page).click();

    const items = page.getByRole("menuitemcheckbox");

    await expect(items.first()).toBeChecked();
    await expect(items.first()).toBeDisabled();

    const first = items.nth(1);
    const second = items.nth(2);
    const names = [
      (await first.textContent()) ?? "",
      (await second.textContent()) ?? "",
    ];

    // The second click lands before the first one's change comes back.
    await first.click();
    await second.click();
    await expect(first).toBeChecked();
    await expect(second).toBeChecked();
    await page.keyboard.press("Escape");

    await expect(
      spellingButton(page, `System language, ${names.join(", ")}`)
    ).toBeVisible();

    await expect
      .poll(() => savedSetting(userDataDir, "spellcheckLanguages"))
      .toHaveLength(2);

    const chosen = (await savedSetting(
      userDataDir,
      "spellcheckLanguages"
    )) as string[];

    await expect
      .poll(() => checkedLanguages(app, profileId))
      .toStrictEqual([...system, ...chosen]);
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
