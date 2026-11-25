// The free version runs its first profile alone and keeps the others on
// disk for a license to bring back. Each entitlement is reached through its
// stored file and the stand-in server the suite's build holds in place of
// the entitlement API.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import { DAY, MERU_PRO_URL } from "#core/entitlement.ts";

import {
  NO_TRIAL,
  SHELL_URL,
  expect,
  findOverlayDocument,
  findPage,
  readOpenedExternally,
  readState,
  readViews,
  retitle,
  stubSystemBrowser,
  test,
  writeSettings,
  writeState,
} from "./lib/app.ts";
import { openProfiles, openSection, openSettings } from "./lib/settings.ts";
import {
  THEMES,
  emulateTheme,
  onlyWithShots,
  shootWindow,
  shotPath,
} from "./lib/shots.ts";
import type { StandIn } from "./lib/stand-in.ts";

const KEY = "MERU-TEST-AAAA-BBBB-CCCC-7Q2K";

const ONE_PROFILE =
  "The free version uses one profile. Upgrade to Meru Pro to use as many as you like, along with everything else Meru Pro adds.";

interface SavedState {
  profiles: { id: string; name: string }[];
  selectedProfileId: string;
}

/** Personal and Work, Work selected, each with its Gmail tab as the app writes it; Work has a second tab too. */
const seed = async (userDataDir: string, standIn: StandIn) => {
  const gmail = {
    id: "gmail",
    app: "gmail",
    url: standIn.url,
    title: "",
    pinned: true,
    openAtLaunch: true,
  };
  const work = {
    id: "work",
    name: "Work",
    tabs: [
      gmail,
      { id: "calendar", app: "calendar", url: standIn.url, title: "Calendar" },
    ],
    selectedTabId: "calendar",
    color: "green",
    later: { kept: true },
  };

  await writeState(userDataDir, {
    profiles: [
      {
        id: "personal",
        name: "Personal",
        tabs: [gmail],
        selectedTabId: "gmail",
        color: "blue",
      },
      work,
    ],
    selectedProfileId: "work",
  });
  await writeSettings(userDataDir, {
    profiles: { work: { notificationSender: false } },
  });

  return work;
};

/** The stand-in remembers a trial that ended, so its answers keep the install free. */
const endTrial = (userDataDir: string) =>
  writeFile(
    path.join(userDataDir, "entitlement-stub.json"),
    JSON.stringify({ trialStartedAt: Date.now() - 15 * DAY, licenses: {} })
  );

/** A key the stand-in knows, held as a key carried over is, so the run is Pro from launch. */
const license = async (userDataDir: string, known: boolean) => {
  await writeFile(
    path.join(userDataDir, "entitlement.json"),
    JSON.stringify({ version: 1, licenseKey: KEY, keyStoredAt: Date.now() })
  );
  await writeFile(
    path.join(userDataDir, "entitlement-stub.json"),
    JSON.stringify({
      licenses: known ? { [KEY]: { generated: "Device 4F2A" } } : {},
    })
  );
};

const profileButtons = (shell: Page) =>
  shell.getByRole("group", { name: "Profiles" }).getByRole("button");

/** Every web contents' session, by its partition's folder. */
const partitions = (app: ElectronApplication) =>
  app.evaluate(({ webContents }) => [
    ...new Set(
      webContents
        .getAllWebContents()
        .map((contents) => contents.session.storagePath)
        .filter((stored): stored is string => stored !== null)
        .map((stored) => stored.split(/[/\\]/u).at(-1))
    ),
  ]);

/** The partition of each content view, or of each shown one. */
const viewPartitions = async (app: ElectronApplication, shownOnly = false) => {
  const { views } = await readViews(app);

  return views
    .filter((view) => !shownOnly || view.visible)
    .map((view) => view.partition);
};

const firstName = async (userDataDir: string) => {
  const { profiles } = await readState<SavedState>(userDataDir);

  return profiles[0]?.name;
};

const snapshot = (app: ElectronApplication) =>
  app.evaluate(() =>
    (
      Reflect.get(globalThis, "meruTestEntitlement") as {
        snapshot: () => { status: string; downgradePending: boolean };
      }
    ).snapshot()
  );

const launchFree = async (
  launchApp: (env?: Record<string, string>) => Promise<ElectronApplication>,
  userDataDir: string
) => {
  await endTrial(userDataDir);

  const app = await launchApp(NO_TRIAL);
  const shell = await findPage(app, SHELL_URL);

  await expect
    .poll(() => snapshot(app))
    .toMatchObject({ status: "trialEnded" });

  return { app, shell };
};

test("the free version runs the first profile alone, whichever is selected, and creates nothing of the other", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn);

  const { app, shell } = await launchFree(launchApp, userDataDir);

  await findPage(app, standIn.url);
  await expect(profileButtons(shell)).toHaveCount(0);
  await expect
    .poll(() => viewPartitions(app))
    .toStrictEqual(["persist:personal"]);
  await expect(partitions(app)).resolves.not.toContain("work");
});

test("a write while free keeps the other profile, its settings and the stored selection as found", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const work = await seed(userDataDir, standIn);
  const { app } = await launchFree(launchApp, userDataDir);
  const gmail = await findPage(app, standIn.url);
  const page = await openSettings(app);

  await openProfiles(page);
  await page
    .getByRole("list", { name: "Profiles" })
    .getByRole("button", { name: "Personal", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Name" }).fill("Mine");
  await page.getByRole("textbox", { name: "Name" }).press("Enter");
  await retitle(gmail, "Inbox (3)");
  await expect.poll(() => firstName(userDataDir)).toBe("Mine");

  const saved = await readState<SavedState>(userDataDir);

  expect(saved.selectedProfileId).toBe("work");
  expect(saved.profiles[1]).toStrictEqual(work);
  expect(
    JSON.parse(await readFile(path.join(userDataDir, "settings.json"), "utf-8"))
  ).toMatchObject({ profiles: { work: { notificationSender: false } } });
});

test("Settings on the free version shows the other profile dimmed with the Meru Pro badge, and Add profile disabled", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn);

  const { app } = await launchFree(launchApp, userDataDir);

  await stubSystemBrowser(app);

  const page = await openSettings(app);
  const list = page.getByRole("list", { name: "Profiles" });

  await openProfiles(page);
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(
    list.getByRole("button", { name: "Work", exact: true })
  ).toHaveCount(0);
  await expect(
    list.getByText("You need Meru Pro to use this profile.")
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add profile", exact: true })
  ).toBeDisabled();

  const badge = page.getByRole("button", { name: "Meru Pro Work" });

  await badge.click();

  const popover = page.getByRole("dialog", { name: "Requires Meru Pro" });

  await expect(popover).toBeVisible();
  await expect(popover.getByText(ONE_PROFILE)).toBeVisible();
  await expect(popover.getByText("Work")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
  await expect(badge).toBeFocused();

  await page.getByRole("button", { name: "Meru Pro Add profile" }).click();
  await popover.getByRole("button", { name: "Upgrade" }).click();
  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual([MERU_PRO_URL]);
});

test("Add another account on the free version adds no profile and says why", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app } = await launchFree(launchApp, userDataDir);
  const view = await findPage(app, standIn.url);
  const overlay = await findOverlayDocument(app);

  await view.getByRole("link", { name: "Add another account" }).click();
  await expect(
    overlay.getByText(
      "The free version uses one profile. Upgrade to Meru Pro to add more.",
      { exact: true }
    )
  ).toBeVisible();
  await expect(readState<SavedState>(userDataDir)).resolves.toMatchObject({
    profiles: [expect.anything()],
  });
});

test("a license activated while free brings the other profile back at once, selected as stored", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn);

  const { app, shell } = await launchFree(launchApp, userDataDir);
  const page = await openSettings(app);

  await openSection(page, "Meru Pro");
  await page.getByRole("button", { name: "Enter license key…" }).click();
  await page.getByRole("textbox", { name: "License key" }).fill(KEY);
  await page.getByRole("button", { name: "Activate" }).click();

  await expect(profileButtons(shell)).toHaveCount(2);
  await expect(
    profileButtons(shell).filter({ hasText: "Work" })
  ).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => viewPartitions(app, true)).toContain("persist:work");

  await openProfiles(page);
  await expect(
    page
      .getByRole("list", { name: "Profiles" })
      .getByRole("button", { name: "Work", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("button", { name: /^Meru Pro/u })
  ).toHaveCount(0);
});

test("a trial and a license run every profile, and a license lost while running holds until the next launch", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn);

  const trial = await launchApp();

  await expect(profileButtons(await findPage(trial, SHELL_URL))).toHaveCount(2);
  await trial.close();

  // The stand-in knows no license with the key, so its answer takes Pro away.
  await license(userDataDir, false);

  const refused = await launchApp();
  const shell = await findPage(refused, SHELL_URL);

  await expect
    .poll(() => snapshot(refused))
    .toMatchObject({ status: "refused", downgradePending: true });
  await expect(profileButtons(shell)).toHaveCount(2);
  await refused.close();

  const next = await launchApp();

  await expect(profileButtons(await findPage(next, SHELL_URL))).toHaveCount(0);
  await expect(readState<SavedState>(userDataDir)).resolves.toMatchObject({
    selectedProfileId: "work",
    profiles: [{ id: "personal" }, { id: "work" }],
  });
});

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("Settings' Profiles on the free version, its popover, and the title bar free and licensed, light and dark", async ({
    launchApp,
    userDataDir,
    standIn,
  }) => {
    await seed(userDataDir, standIn);

    const { app, shell } = await launchFree(launchApp, userDataDir);

    await findPage(app, standIn.url);

    const page = await openSettings(app);

    await openProfiles(page);

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, theme);
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await page.screenshot({
        path: shotPath("settings-profiles-free", theme),
      });
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await page.getByRole("button", { name: "Meru Pro Work" }).click();
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await expect(
        page.getByRole("dialog", { name: "Requires Meru Pro" })
      ).toBeVisible();
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await page.screenshot({
        path: shotPath("settings-profiles-free-popover", theme),
      });
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await page.keyboard.press("Escape");
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await shootWindow(app, shell, shotPath("titlebar-free", theme));
    }

    await app.close();
    await license(userDataDir, true);

    const licensed = await launchApp();
    const licensedShell = await findPage(licensed, SHELL_URL);

    await findPage(licensed, standIn.url);
    await expect(profileButtons(licensedShell)).toHaveCount(2);

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(licensed, theme);
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await shootWindow(
        licensed,
        licensedShell,
        shotPath("titlebar-licensed", theme)
      );
    }
  });
});
