import { realpathSync } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import {
  SHELL_URL,
  clickMenuItem,
  expect,
  findOverlayDocument,
  findPage,
  readOpenedExternally,
  readViews,
  stubSystemBrowser,
  test,
  writeSettings,
} from "./lib/app.ts";
import {
  gmailOf,
  openSection,
  openSettings,
  scopeTab,
  seedProfiles,
  switchNamed,
} from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";
import { DOWNLOAD_FILES, DOWNLOAD_LINKS } from "./lib/stand-in.ts";
import type { StandIn } from "./lib/stand-in.ts";

const IN_MERU = "Open Google apps in Meru";
const IN_BROWSER = "Always open in your default browser";
const SAVE_TO = "Save downloads to";
const REPORT = DOWNLOAD_FILES.small.name;

/** A path in one spelling, past the link macOS puts before the temporary folder. */
const canonical = (file: string) => realpathSync.native(file);

/** Where the test build saves downloads, in place of the system's folder. */
const systemFolder = (userDataDir: string) =>
  path.join(canonical(userDataDir), "Downloads");

const filesIn = async (folder: string) => {
  try {
    return await readdir(folder);
  } catch {
    return [];
  }
};

const readStored = async (userDataDir: string) => {
  try {
    return JSON.parse(
      await readFile(path.join(userDataDir, "settings.json"), "utf-8")
    ) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const storedKey = async (userDataDir: string, key: string) => {
  const stored = await readStored(userDataDir);

  return stored[key];
};

/** Home and Work, Home selected, each with its Gmail tab. */
const seed = async (
  userDataDir: string,
  standIn: StandIn,
  settings: object = {}
) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work"]);
  await writeSettings(userDataDir, settings);
};

/** Selects the profile from the titlebar, and waits until it shows as selected. */
const selectProfile = async (shell: Page, name: string) => {
  const button = shell
    .getByRole("banner", { name: "Title bar" })
    .getByRole("group", { name: "Profiles" })
    .getByRole("button", { name: new RegExp(`^${name}`, "u") });

  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
};

/** The URL of each content view of the profile's session. */
const viewsOf = async (app: ElectronApplication, profileId: string) => {
  const { views } = await readViews(app);

  return views
    .filter((view) => view.partition === `persist:${profileId}`)
    .map((view) => view.url);
};

const openPage = async (page: Page, name: string) => {
  await openSection(page, name);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
};

const manage = (page: Page) =>
  page.getByRole("button", {
    name: "Manage Google apps that open in your default browser",
  });

const manageDialog = (page: Page) =>
  page.getByRole("dialog", { name: IN_BROWSER });

const appBox = (page: Page, name: string) =>
  manageDialog(page).getByRole("checkbox", { name, exact: true });

const changeFolder = (page: Page) =>
  page.getByRole("button", {
    name: "Change where downloads are saved",
    exact: true,
  });

/** Sets what the test build's folder picker answers: a folder, or `null` to cancel. */
const answerFolderPicker = (app: ElectronApplication, answer: string | null) =>
  app.evaluate((_electron, folder) => {
    (
      Reflect.get(globalThis, "meruTestFolderPicker") as {
        answer: string | null;
      }
    ).answer = folder;
  }, answer);

test("a profile that opens Google apps in the browser sends its Gmail's Drive link and New tab's Drive there, while the other profile's open tabs", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn, {
    profiles: { work: { openAppsInMeru: false } },
  });

  const app = await launchApp();
  const shell = await findPage(app, SHELL_URL);
  const home = await gmailOf(app, standIn, "home");

  await stubSystemBrowser(app);
  await home.getByRole("link", { name: "Open Drive" }).click();
  await expect
    .poll(() => viewsOf(app, "home"))
    .toStrictEqual([standIn.url, standIn.driveUrl]);

  await selectProfile(shell, "Work");

  const work = await gmailOf(app, standIn, "work");

  await work.getByRole("link", { name: "Open Drive" }).click();
  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual([standIn.driveUrl]);
  expect(await viewsOf(app, "work")).toStrictEqual([standIn.url]);

  // New tab opens over the selected profile and reads its settings.
  const overlay = await findOverlayDocument(app);
  const launcher = overlay.getByRole("dialog", { name: "New tab" });

  await clickMenuItem(app, "app.open");
  await expect(launcher).toBeVisible();
  await overlay.getByRole("option", { name: "Drive" }).click();
  await expect(launcher).toHaveCount(0);
  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual([standIn.driveUrl, standIn.driveUrl]);
  expect(await viewsOf(app, "work")).toStrictEqual([standIn.url]);

  await selectProfile(shell, "Home");
  await clickMenuItem(app, "app.open");
  await expect(launcher).toBeVisible();
  await overlay.getByRole("option", { name: "Drive" }).click();
  await expect
    .poll(() => viewsOf(app, "home"))
    .toStrictEqual([standIn.url, standIn.driveUrl, standIn.driveUrl]);
  expect(await readOpenedExternally(app)).toHaveLength(2);
});

test("a profile's own downloads folder takes its downloads while the other profile's go to the app's", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const workFolder = path.join(canonical(userDataDir), "Work downloads");

  await mkdir(workFolder);
  await seed(userDataDir, standIn, {
    profiles: { work: { downloadsFolder: workFolder } },
  });

  const app = await launchApp();
  const shell = await findPage(app, SHELL_URL);
  const home = await gmailOf(app, standIn, "home");

  await home.goto(standIn.downloadsUrl);
  await home.getByRole("link", { name: DOWNLOAD_LINKS.small }).click();
  await expect
    .poll(() => filesIn(systemFolder(userDataDir)))
    .toStrictEqual([REPORT]);

  await selectProfile(shell, "Work");

  const work = await gmailOf(app, standIn, "work");

  await work.goto(standIn.downloadsUrl);
  await work.getByRole("link", { name: DOWNLOAD_LINKS.small }).click();
  await expect.poll(() => filesIn(workFolder)).toStrictEqual([REPORT]);
  expect(await filesIn(systemFolder(userDataDir))).toStrictEqual([REPORT]);
});

test("Tabs & Google Apps has scopes: a profile's switch and Manage… set its own values, All profiles names it, and Reset follows the app again", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn, { appsInDefaultBrowser: ["meet"] });

  const page = await openSettings(await launchApp());

  await openPage(page, "Tabs & Google Apps");
  await expect(page.getByRole("group", { name: "Sleep" })).toBeVisible();

  await scopeTab(page, "Work").click();
  await expect(
    page.getByText("Changes here only apply to Work.")
  ).toBeVisible();
  // Sleep is the app's alone, so a profile's scope leaves it out.
  await expect(page.getByRole("group", { name: "Sleep" })).toHaveCount(0);
  await expect(manage(page)).toHaveAccessibleDescription("1 Google app");
  await expect(page.getByText("Same as All profiles.")).toHaveCount(2);

  // With no list of its own, Work's starts from the app's.
  await manage(page).click();
  await expect(appBox(page, "Meet")).toBeChecked();
  await appBox(page, "Drive").click();
  await expect(appBox(page, "Drive")).toBeChecked();
  await expect
    .poll(() => storedKey(userDataDir, "profiles"))
    .toStrictEqual({ work: { appsInDefaultBrowser: ["meet", "drive"] } });
  await manageDialog(page).getByRole("button", { name: "Done" }).click();
  await expect(manage(page)).toHaveAccessibleDescription("2 Google apps");
  await expect(
    page.getByText("Set for Work only. For all profiles, it's 1 Google app.")
  ).toBeVisible();

  await switchNamed(page, IN_MERU).click();
  await expect(switchNamed(page, IN_MERU)).not.toBeChecked();
  await expect(
    page.getByText("Set for Work only. For all profiles, it's On.")
  ).toBeVisible();
  await expect
    .poll(() => storedKey(userDataDir, "profiles"))
    .toStrictEqual({
      work: { appsInDefaultBrowser: ["meet", "drive"], openAppsInMeru: false },
    });

  await scopeTab(page, "All profiles").click();
  await expect(switchNamed(page, IN_MERU)).toBeChecked();
  await expect(page.getByText("Set differently for 1 profile:")).toHaveCount(2);
  await manage(page).click();
  await expect(appBox(page, "Meet")).toBeChecked();
  await expect(appBox(page, "Drive")).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(manageDialog(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Show Work" }).first().click();
  await expect(scopeTab(page, "Work")).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: `Reset ${IN_MERU} to All profiles` })
    .click();
  await page
    .getByRole("button", { name: `Reset ${IN_BROWSER} to All profiles` })
    .click();
  await expect(switchNamed(page, IN_MERU)).toBeChecked();
  await expect(manage(page)).toHaveAccessibleDescription("1 Google app");
  await expect(page.getByText("Same as All profiles.")).toHaveCount(2);
  await expect.poll(() => storedKey(userDataDir, "profiles")).toBeUndefined();
  expect(await storedKey(userDataDir, "appsInDefaultBrowser")).toStrictEqual([
    "meet",
  ]);
});

test("General has scopes: a profile's scope shows its downloads folder alone, which Change… sets for it, a gone one says so, and Reset follows the app again", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const appFolder = path.join(canonical(userDataDir), "App downloads");
  const workFolder = path.join(canonical(userDataDir), "Work downloads");
  const gone = path.join(canonical(userDataDir), "Gone");

  await mkdir(appFolder);
  await mkdir(workFolder);
  await seed(userDataDir, standIn, {
    downloadsFolder: appFolder,
    profiles: { home: { downloadsFolder: gone } },
  });

  const app = await launchApp();
  const page = await openSettings(app);

  await openPage(page, "General");
  await expect(
    page.getByRole("switch", { name: "Ask where to save each file" })
  ).toBeVisible();
  await expect(page.getByText("Set differently for 1 profile:")).toBeVisible();

  await scopeTab(page, "Work").click();
  await expect(page.getByRole("group", { name: "Startup" })).toHaveCount(0);
  await expect(
    page.getByRole("switch", { name: "Ask where to save each file" })
  ).toHaveCount(0);
  await expect(page.getByText(SAVE_TO, { exact: true })).toBeVisible();
  await expect(changeFolder(page)).toHaveAccessibleDescription(appFolder);
  await expect(page.getByText("Same as All profiles.")).toBeVisible();

  await answerFolderPicker(app, workFolder);
  await changeFolder(page).click();
  await expect(changeFolder(page)).toHaveAccessibleDescription(workFolder);
  await expect(
    page.getByText(`Set for Work only. For all profiles, it's ${appFolder}.`)
  ).toBeVisible();
  await expect
    .poll(() => storedKey(userDataDir, "profiles"))
    .toStrictEqual({
      home: { downloadsFolder: gone },
      work: { downloadsFolder: workFolder },
    });

  await scopeTab(page, "Home").click();
  await expect(changeFolder(page)).toHaveAccessibleDescription(
    `${gone} This folder isn't available. Downloads go to Downloads until it's back.`
  );
  await expect(
    page.getByText(`Set for Home only. For all profiles, it's ${appFolder}.`)
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Reset ${SAVE_TO} to All profiles` })
    .click();
  await expect(changeFolder(page)).toHaveAccessibleDescription(appFolder);
  await expect(page.getByText("Same as All profiles.")).toBeVisible();

  await scopeTab(page, "All profiles").click();
  await expect(page.getByText("Set differently for 1 profile:")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show Work" })).toBeVisible();
  expect(await storedKey(userDataDir, "downloadsFolder")).toBe(appFolder);
});

const shoot = async (app: ElectronApplication, page: Page, surface: string) => {
  for (const theme of THEMES) {
    // oxlint-disable-next-line no-await-in-loop -- one theme at a time
    await emulateTheme(app, theme);
    // oxlint-disable-next-line no-await-in-loop -- one after another
    await page.screenshot({ path: shotPath(surface, theme) });
  }
};

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("a profile's scope of Tabs & Google Apps and of General, each with an override, light and dark", async ({
    launchApp,
    userDataDir,
    standIn,
  }) => {
    const workFolder = path.join(canonical(userDataDir), "Work downloads");

    await mkdir(workFolder);
    await seed(userDataDir, standIn, {
      appsInDefaultBrowser: ["meet"],
      profiles: {
        work: {
          openAppsInMeru: true,
          openAppsIn: "windows",
          appsInDefaultBrowser: ["meet", "drive"],
          downloadsFolder: workFolder,
        },
      },
    });

    const app = await launchApp();
    const page = await openSettings(app);

    await openPage(page, "Tabs & Google Apps");
    await scopeTab(page, "Work").click();
    await expect(manage(page)).toHaveAccessibleDescription(/^2 Google apps/u);
    await shoot(app, page, "settings-tabs-apps-scope-profile");

    await openPage(page, "General");
    await scopeTab(page, "Work").click();
    await expect(changeFolder(page)).toBeVisible();
    await shoot(app, page, "settings-general-scope-profile");
  });
});
