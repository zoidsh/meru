import { realpathSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import {
  expect,
  findPage,
  test,
  writeSettings,
  writeState,
} from "./lib/app.ts";
import { openSection, openSettings } from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";
import { DOWNLOAD_FILES, DOWNLOAD_LINKS } from "./lib/stand-in.ts";

const LOG = path.join("logs", "main.log");

/** The log as the file holds it, empty while there is none yet. */
const readLog = async (userDataDir: string) => {
  try {
    return await readFile(path.join(userDataDir, LOG), "utf-8");
  } catch {
    return "";
  }
};

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

const filesIn = async (folder: string) => {
  try {
    return await readdir(folder);
  } catch {
    return [];
  }
};

const openAdvanced = async (app: ElectronApplication) => {
  const page = await openSettings(app);

  await openSection(page, "Advanced");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Advanced");

  return page;
};

const exportButton = (page: Page) =>
  page.getByRole("button", { name: "Export logs" });

const PROFILE_NAME = "Ada Lovelace";
const QUERY = "invoice-4711";
const SAVED_AS = "Ada tax return 2026.pdf";

test("the log holds what happened, a failed load and a download included, and none of the person's names, searches, files or folders", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const home = path.join(
    realpathSync.native(userDataDir),
    "Ada Lovelace Files"
  );

  await mkdir(home);
  // A store set aside, so a line holds a path in the user data folder.
  await writeFile(path.join(userDataDir, "entitlement.json"), "{ not json");
  await writeSettings(userDataDir, { downloadsSaveAs: true });
  await writeState(userDataDir, {
    profiles: [
      {
        id: "p",
        name: PROFILE_NAME,
        tabs: [
          {
            id: "gmail",
            app: "gmail",
            url: `${standIn.url}?q=${QUERY}#search/${QUERY}`,
            title: "",
          },
        ],
        selectedTabId: "gmail",
      },
    ],
    selectedProfileId: "p",
  });
  await standIn.refuse();

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await expect(
    shell.getByRole("heading", { name: "Gmail couldn’t load" })
  ).toBeVisible();
  await standIn.answer();
  await expect(
    shell.getByRole("heading", { name: "Gmail couldn’t load" })
  ).toBeHidden({ timeout: 15_000 });

  const gmail = await findPage(app, standIn.url);

  await answerSaveDialog(app, path.join(home, SAVED_AS));
  await gmail.goto(standIn.downloadsUrl);
  await gmail.getByRole("link", { name: DOWNLOAD_LINKS.small }).click();
  await expect.poll(() => filesIn(home)).toStrictEqual([SAVED_AS]);

  await expect
    .poll(() => readLog(userDataDir), { timeout: 10_000 })
    .toContain("download-ended end=completed");

  const log = await readLog(userDataDir);

  expect(log.split("\n")[0]).toMatch(
    /^\S+ run-started app="Meru(?: Dev)? \S+" build=\w+ os="\w+ [^"]+" arch=\w+ electron=\S+$/u
  );
  for (const event of [
    'view-created tab="profile 1 tab 1 gmail" app=gmail',
    'tab-load-failed tab="profile 1 tab 1 gmail" host=127.0.0.1 code=-102',
    "download-started",
    "store-set-aside file=<data>/entitlement.json kept=<data>/entitlement.corrupt-",
  ]) {
    expect(log).toContain(event);
  }

  const personal = [
    PROFILE_NAME,
    QUERY,
    "search/",
    SAVED_AS,
    "tax return",
    DOWNLOAD_FILES.small.name,
    // The person's own folders, by the last name in each, however a line
    // escapes them.
    path.basename(homedir()),
    path.basename(userDataDir),
    path.basename(home),
  ];

  // Each also as a quoted line escapes it, where that differs.
  for (const text of new Set(
    personal.flatMap((one) => [one, JSON.stringify(one).slice(1, -1)])
  )) {
    expect(log).not.toContain(text);
  }
});

test("Export… saves a copy of the log where the Save dialog says, showing Saved, and offers a dated name in Downloads", async ({
  app,
  userDataDir,
}) => {
  const destination = path.join(realpathSync.native(userDataDir), "copy.txt");
  const page = await openAdvanced(app);

  await expect(exportButton(page)).toHaveAccessibleDescription(
    "Save a copy of the logs to send to support."
  );
  await answerSaveDialog(app, destination);
  await exportButton(page).click();

  await expect(exportButton(page)).toHaveText("Saved");
  await expect(
    page.getByRole("status").filter({ hasText: "Saved" })
  ).toHaveCount(1);
  await expect(exportButton(page)).toHaveText("Export…");

  const copy = await readFile(destination, "utf-8");

  expect(copy).toMatch(/^\S+ run-started /u);
  const log = await readLog(userDataDir);

  // The log goes on after the copy, which holds all it had then.
  expect(log.startsWith(copy)).toBeTruthy();

  const [asked] = await saveDialogAsked(app);

  expect(path.basename(asked ?? "")).toMatch(
    /^Meru(?: Dev)? logs \d{4}-\d{2}-\d{2}\.txt$/u
  );
  expect(path.basename(path.dirname(asked ?? ""))).toBe("Downloads");
});

test("Export… canceled writes nothing and shows nothing", async ({
  app,
  userDataDir,
}) => {
  const page = await openAdvanced(app);

  await answerSaveDialog(app, null);
  await exportButton(page).click();

  await expect.poll(() => saveDialogAsked(app)).toHaveLength(1);
  await expect(exportButton(page)).toBeEnabled();
  await expect(exportButton(page)).toHaveText("Export…");
  await expect(
    page.getByRole("status").filter({ hasText: "Saved" })
  ).toHaveCount(0);
  await expect(
    page.getByText("Couldn't save the logs. Try again.")
  ).toHaveCount(0);
  await expect.poll(() => readLog(userDataDir)).not.toContain("logs-export");
});

test("Export… that cannot write the copy says so until the next click", async ({
  app,
  userDataDir,
}) => {
  const page = await openAdvanced(app);
  const error = page.getByText("Couldn't save the logs. Try again.");

  await answerSaveDialog(
    app,
    path.join(realpathSync.native(userDataDir), "missing", "copy.txt")
  );
  await exportButton(page).click();

  await expect(error).toBeVisible();
  await expect(exportButton(page)).toHaveText("Export…");
  await expect.poll(() => readLog(userDataDir)).toContain("logs-export-failed");

  await answerSaveDialog(app, null);
  await exportButton(page).click();
  await expect(error).toBeHidden();
});

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("the Logs row at rest and showing Saved, light and dark", async ({
    app,
    userDataDir,
  }) => {
    const page = await openAdvanced(app);

    await answerSaveDialog(
      app,
      path.join(realpathSync.native(userDataDir), "copy.txt")
    );
    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, theme);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await expect(exportButton(page)).toHaveText("Export…");
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.screenshot({
        path: shotPath("settings-advanced-logs", theme),
      });
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await exportButton(page).click();
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await expect(exportButton(page)).toHaveText("Saved");
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.screenshot({
        path: shotPath("settings-advanced-logs-saved", theme),
      });
    }
  });
});
