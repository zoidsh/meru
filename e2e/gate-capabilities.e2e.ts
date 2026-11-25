// The free version's gates after the profiles': what each Pro capability
// leaves undone with no license, what Settings shows of it, and that a
// license activated while running brings it back with nothing stored lost.
// Each entitlement is reached through its stored file and the stand-in
// server the suite's build holds in place of the entitlement API.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import { DAY } from "#core/entitlement.ts";

import {
  NO_TRIAL,
  SHELL_URL,
  expect,
  findPage,
  test,
  writeSettings,
  writeState,
} from "./lib/app.ts";
import { openSection, openSettings, switchNamed } from "./lib/settings.ts";
import type { StandIn } from "./lib/stand-in.ts";

const KEY = "MERU-TEST-AAAA-BBBB-CCCC-7Q2K";

const SETTINGS_FILE = "settings.json";

const readStored = (userDataDir: string, file: string) =>
  readFile(path.join(userDataDir, file), "utf-8");

/** Personal and Work, each with its Gmail tab, Personal selected. */
const seedTwoProfiles = (
  userDataDir: string,
  standIn: StandIn,
  extra: Record<string, unknown> = {}
) =>
  writeState(userDataDir, {
    profiles: ["personal", "work"].map((id) => ({
      id,
      name: id === "work" ? "Work" : "Personal",
      tabs: [{ id: "gmail", app: "gmail", url: standIn.url, title: "" }],
      selectedTabId: "gmail",
    })),
    selectedProfileId: "personal",
    ...extra,
  });

const snapshot = (app: ElectronApplication) =>
  app.evaluate(() =>
    (
      Reflect.get(globalThis, "meruTestEntitlement") as {
        snapshot: () => { status: string };
      }
    ).snapshot()
  );

/** Launches with a trial the stand-in remembers as ended, so the run is free. */
const launchFree = async (
  launchApp: (env?: Record<string, string>) => Promise<ElectronApplication>,
  userDataDir: string,
  standIn: StandIn
) => {
  await writeFile(
    path.join(userDataDir, "entitlement-stub.json"),
    JSON.stringify({ trialStartedAt: Date.now() - 15 * DAY, licenses: {} })
  );

  const app = await launchApp(NO_TRIAL);
  const shell = await findPage(app, SHELL_URL);

  await expect
    .poll(() => snapshot(app))
    .toMatchObject({ status: "trialEnded" });
  await findPage(app, standIn.url);

  return { app, shell };
};

/** Activates a license from Settings' Meru Pro page, as a person would. */
const activate = async (page: Page) => {
  await openSection(page, "Meru Pro");
  await page.getByRole("button", { name: "Enter license key…" }).click();
  await page.getByRole("textbox", { name: "License key" }).fill(KEY);
  await page.getByRole("button", { name: "Activate" }).click();
  await expect(
    page.getByRole("button", { name: "Enter license key…" })
  ).toHaveCount(0);
};

/** The application menu's item: its label, its badge where macOS has one, and whether it is enabled. */
const menuItem = (app: ElectronApplication, id: string) =>
  app.evaluate(({ Menu }, itemId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(itemId);

    return {
      label: item?.label,
      badge: item?.badge?.content,
      enabled: item?.enabled,
    };
  }, id);

/** How a disabled item says Pro on this platform. */
const proItem = (label: string) =>
  process.platform === "darwin"
    ? { label, badge: "Pro", enabled: false }
    : { label: `${label} (Pro)`, badge: undefined, enabled: false };

const titlebar = (shell: Page) =>
  shell.getByRole("banner", { name: "Title bar" });

const badgeOf = (page: Page, label: string) =>
  page.getByRole("button", { name: `Meru Pro ${label}`, exact: true });

test("the free version offers no unified inbox, shows its title bar switch as a Pro row, and keeps what is stored", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedTwoProfiles(userDataDir, standIn);
  await writeSettings(userDataDir, {
    titlebarUnifiedInbox: true,
    profiles: { personal: { unifiedInbox: false } },
  });

  const settingsBefore = await readStored(userDataDir, SETTINGS_FILE);
  const { app, shell } = await launchFree(launchApp, userDataDir, standIn);

  await expect
    .poll(() => menuItem(app, "inbox.toggle"))
    .toStrictEqual(proItem("Unified Inbox"));
  await expect(
    titlebar(shell).getByRole("button", { name: "Unified inbox", exact: true })
  ).toHaveCount(0);

  const page = await openSettings(app);

  await openSection(page, "Appearance");
  await expect(switchNamed(page, "Unified inbox")).toBeDisabled();
  await expect(switchNamed(page, "Unified inbox")).not.toBeChecked();
  await expect(badgeOf(page, "Unified inbox")).toBeVisible();
  await expect(badgeOf(page, "Downloads")).toHaveCount(0);
  await expect(readStored(userDataDir, SETTINGS_FILE)).resolves.toBe(
    settingsBefore
  );

  await activate(page);
  await openSection(page, "Appearance");
  await expect(switchNamed(page, "Unified inbox")).toBeChecked();
  await expect(switchNamed(page, "Unified inbox")).toBeEnabled();
  await expect(badgeOf(page, "Unified inbox")).toHaveCount(0);
  await expect
    .poll(() => menuItem(app, "inbox.toggle"))
    .toStrictEqual({ label: "Unified Inbox", badge: undefined, enabled: true });
  await expect(
    titlebar(shell).getByRole("button", { name: "Unified inbox", exact: true })
  ).toBeVisible();
});
