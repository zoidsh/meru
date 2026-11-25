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
  readState,
  readUnreadTotal,
  retitle,
  test,
  writeSettings,
  writeState,
} from "./lib/app.ts";
import {
  openProfiles,
  openSection,
  openSettings,
  profileRow,
  switchNamed,
} from "./lib/settings.ts";
import { ANY_SESSION, listing } from "./lib/stand-in.ts";
import type { StandIn } from "./lib/stand-in.ts";

/** One profile, Home, with its Gmail tab, and whatever else the state holds. */
const seedOneProfile = (
  userDataDir: string,
  standIn: StandIn,
  extra: Record<string, unknown> = {}
) =>
  writeState(userDataDir, {
    profiles: [
      {
        id: "home",
        name: "Home",
        tabs: [{ id: "gmail", app: "gmail", url: standIn.url, title: "" }],
        selectedTabId: "gmail",
      },
    ],
    selectedProfileId: "home",
    ...extra,
  });

/** The titles of the notifications the suite's build captured in place of showing them. */
const notified = (app: ElectronApplication) =>
  app.evaluate(() =>
    (
      Reflect.get(globalThis, "meruTestNotifications") as { title: string }[]
    ).map(({ title }) => title)
  );

/** Mail 2 arrives after mail 1, which the first poll found. */
const arrive = async (
  app: ElectronApplication,
  gmail: Page,
  standIn: StandIn,
  extra: Record<string, unknown> = {}
) => {
  await expect.poll(() => readUnreadTotal(app)).toBe(1);
  standIn.setFeed(ANY_SESSION, { ...listing("2", "1"), ...extra });
  await retitle(gmail, "Inbox (2)");
  await expect.poll(() => readUnreadTotal(app)).toBe(2);
};

/** The application menu's submenu labelled `label` or with Pro after it, as an item is read. */
const menuNamed = (app: ElectronApplication, label: string) =>
  app.evaluate(({ Menu }, wanted) => {
    const item = Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find(
        (candidate) =>
          candidate.label === wanted || candidate.label === `${wanted} (Pro)`
      );

    return {
      label: item?.label,
      badge: item?.badge?.content,
      enabled: item?.enabled,
    };
  }, label);

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
  const gmail = await findPage(app, standIn.url);

  return { app, shell, gmail };
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

const DO_NOT_DISTURB = { until: null };
const QUIET_ALL_DAY = [{ start: "00:00", end: "00:00" }];

test("the free version holds no mail by Do Not Disturb, quiet hours or important only, shows no moon, and keeps all three stored", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedOneProfile(userDataDir, standIn, { doNotDisturb: DO_NOT_DISTURB });
  await writeSettings(userDataDir, {
    quietHours: QUIET_ALL_DAY,
    notificationImportantOnly: true,
    titlebarDoNotDisturb: true,
  });
  standIn.setFeed(ANY_SESSION, listing("1"));

  const settingsBefore = await readStored(userDataDir, SETTINGS_FILE);
  const { app, shell, gmail } = await launchFree(
    launchApp,
    userDataDir,
    standIn
  );

  await arrive(app, gmail, standIn, { important: [] });
  await expect.poll(() => notified(app)).toStrictEqual(["Sender 2"]);
  await expect(
    titlebar(shell).getByRole("button", { name: "Do Not Disturb" })
  ).toHaveCount(0);
  await expect
    .poll(() => menuNamed(app, "Do Not Disturb"))
    .toStrictEqual(proItem("Do Not Disturb"));

  const page = await openSettings(app);

  await expect(switchNamed(page, "Do Not Disturb")).toBeDisabled();
  await expect(switchNamed(page, "Do Not Disturb")).not.toBeChecked();
  await expect(switchNamed(page, "Only important mail")).toBeDisabled();
  await expect(switchNamed(page, "Only important mail")).not.toBeChecked();
  await expect(page.getByRole("group", { name: "Quiet hours 1" })).toHaveCount(
    0
  );
  await expect(
    page.getByRole("button", { name: "Add", exact: true })
  ).toBeDisabled();

  for (const label of [
    "Do Not Disturb",
    "Only important mail",
    "Quiet hours",
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- one row after another
    await expect(badgeOf(page, label)).toBeVisible();
  }

  await expect(badgeOf(page, "Allow notifications")).toHaveCount(0);
  await openSection(page, "Appearance");
  await expect(switchNamed(page, "Do Not Disturb")).toBeDisabled();
  await expect(badgeOf(page, "Do Not Disturb")).toBeVisible();
  await expect(readStored(userDataDir, SETTINGS_FILE)).resolves.toBe(
    settingsBefore
  );
  await expect(
    readState<{ doNotDisturb?: unknown }>(userDataDir)
  ).resolves.toMatchObject({ doNotDisturb: DO_NOT_DISTURB });

  await activate(page);
  await expect(
    titlebar(shell).getByRole("button", { name: "Do Not Disturb" })
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => menuNamed(app, "Do Not Disturb"))
    .toStrictEqual({
      label: "Do Not Disturb",
      badge: undefined,
      enabled: true,
    });
  await openSection(page, "Notifications");
  await expect(switchNamed(page, "Do Not Disturb")).toBeChecked();
  await expect(switchNamed(page, "Only important mail")).toBeChecked();
  await expect(
    page.getByRole("group", { name: "Quiet hours 1" })
  ).toBeVisible();
});

const CODE = "493021";

const codeMail = (id: string) => ({
  id,
  subject: "Your verification code",
  summary: `Use ${CODE} to finish signing in`,
  senderName: "Example",
  senderAddress: "no-reply@example.com",
});

const plainMail = {
  id: "1",
  subject: "Lunch",
  summary: "Are we still on?",
  senderName: "Ada",
  senderAddress: "ada@example.com",
};

/** The notifications the suite's build captured, as title and body. */
const notifications = (app: ElectronApplication) =>
  app.evaluate(() =>
    (
      Reflect.get(globalThis, "meruTestNotifications") as {
        title: string;
        body: string;
      }[]
    ).map(({ title, body }) => ({ title, body }))
  );

/** What the suite's build would have written to the clipboard. */
const copied = (app: ElectronApplication) =>
  app.evaluate(() => [
    ...((Reflect.get(globalThis, "meruTestClipboard") as
      | string[]
      | undefined) ?? []),
  ]);

test("the free version finds no verification code, so its mail is notified as any other, and its four rows are Pro rows", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedOneProfile(userDataDir, standIn);
  await writeSettings(userDataDir, {
    verificationCodeCopyMode: "immediately",
    verificationCodeTrash: true,
  });
  standIn.setFeed(ANY_SESSION, { unreadCount: 1, mail: [plainMail] });

  const settingsBefore = await readStored(userDataDir, SETTINGS_FILE);
  const { app, gmail } = await launchFree(launchApp, userDataDir, standIn);

  await expect.poll(() => readUnreadTotal(app)).toBe(1);
  standIn.setFeed(ANY_SESSION, {
    unreadCount: 2,
    mail: [codeMail("2"), plainMail],
  });
  await retitle(gmail, "Inbox (2)");
  await expect
    .poll(() => notifications(app))
    .toStrictEqual([
      {
        title: "Example",
        body: `Your verification code\nUse ${CODE} to finish signing in`,
      },
    ]);
  expect(await copied(app)).toStrictEqual([]);
  expect(standIn.actions).toStrictEqual([]);

  const page = await openSettings(app);

  await openSection(page, "Gmail");
  await expect(switchNamed(page, "Find verification codes")).toBeDisabled();
  await expect(switchNamed(page, "Find verification codes")).not.toBeChecked();
  await expect(switchNamed(page, "Move to Trash after copying")).toBeChecked();
  await expect(switchNamed(page, "Move to Trash after copying")).toBeDisabled();
  await expect(
    page.getByRole("combobox", { name: "Copy code" })
  ).toBeDisabled();

  for (const label of [
    "Find verification codes",
    "Copy code",
    "Mark as read after copying",
    "Move to Trash after copying",
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- one row after another
    await expect(badgeOf(page, label)).toBeVisible();
  }

  await expect(
    page.getByText("Turn on Find verification codes first.")
  ).toHaveCount(0);
  await expect(readStored(userDataDir, SETTINGS_FILE)).resolves.toBe(
    settingsBefore
  );

  await activate(page);
  await openSection(page, "Gmail");
  await expect(switchNamed(page, "Find verification codes")).toBeChecked();
  standIn.setFeed(ANY_SESSION, {
    unreadCount: 3,
    mail: [codeMail("3"), codeMail("2"), plainMail],
  });
  await retitle(gmail, "Inbox (3)");
  await expect.poll(() => copied(app)).toStrictEqual([CODE]);
});

/** Each sound the suite's build captured in place of playing it, never heard. */
const sounds = (app: ElectronApplication) =>
  app.evaluate(() => [
    ...(Reflect.get(globalThis, "meruTestSounds") as unknown[]),
  ]);

/** Each notification captured, as its title and whether it was silent. */
const silences = (app: ElectronApplication) =>
  app.evaluate(() =>
    (
      Reflect.get(globalThis, "meruTestNotifications") as {
        title: string;
        silent?: boolean;
      }[]
    ).map(({ title, silent }) => ({ title, silent }))
  );

test("the free version plays Linen at its volume for the system's sound, previews only Linen, and shows Sound as a Pro row", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedOneProfile(userDataDir, standIn);
  await writeSettings(userDataDir, {
    notificationSound: "system",
    notificationSoundVolume: 0.4,
  });
  standIn.setFeed(ANY_SESSION, listing("1"));

  const settingsBefore = await readStored(userDataDir, SETTINGS_FILE);
  const { app, gmail } = await launchFree(launchApp, userDataDir, standIn);

  await arrive(app, gmail, standIn);
  await expect
    .poll(() => silences(app))
    .toStrictEqual([{ title: "Sender 2", silent: true }]);
  expect(await sounds(app)).toStrictEqual([{ sound: "linen", volume: 0.4 }]);

  const page = await openSettings(app);
  const sound = page.getByRole("combobox", { name: "Sound" });

  await expect(sound).toBeDisabled();
  await expect(sound).toContainText("Linen");
  await expect(badgeOf(page, "Sound")).toBeVisible();
  await expect(badgeOf(page, "Volume")).toHaveCount(0);
  await page.getByRole("button", { name: "Play sound" }).click();
  await expect
    .poll(() => sounds(app))
    .toStrictEqual([
      { sound: "linen", volume: 0.4 },
      { sound: "linen", volume: 0.4 },
    ]);
  await expect(readStored(userDataDir, SETTINGS_FILE)).resolves.toBe(
    settingsBefore
  );

  await activate(page);
  await openSection(page, "Notifications");
  await expect(sound).toBeEnabled();
  await expect(sound).toContainText("System");
  await expect(page.getByRole("button", { name: "Play sound" })).toBeDisabled();
});

/** The labels of the application menu's items that run a saved search, in order. */
const menuSearches = (app: ElectronApplication) =>
  app.evaluate(({ Menu }) => {
    const labels: string[] = [];
    const walk = (menu: Electron.Menu | null | undefined) => {
      for (const item of menu?.items ?? []) {
        // An item made without an id has none.
        if ((item.id as string | undefined)?.startsWith("savedSearch.open.")) {
          labels.push(item.label);
        }

        walk(item.submenu);
      }
    };

    walk(Menu.getApplicationMenu());

    return labels;
  });

test("the free version lists no saved search and saves none, shows Add search as Pro, and keeps each one stored", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const searches = [
    { id: "a", query: "is:unread" },
    { id: "b", query: "has:attachment", label: "Files" },
  ];

  await writeState(userDataDir, {
    profiles: [
      {
        id: "home",
        name: "Home",
        tabs: [{ id: "gmail", app: "gmail", url: standIn.url, title: "" }],
        selectedTabId: "gmail",
        savedSearches: searches,
      },
    ],
    selectedProfileId: "home",
  });

  const { app, gmail } = await launchFree(launchApp, userDataDir, standIn);

  await gmail.evaluate(() => {
    location.hash = "#search/is%3Astarred";
  });
  await expect
    .poll(() => menuItem(app, "savedSearch.save"))
    .toStrictEqual(proItem("Save Current Search"));
  expect(await menuSearches(app)).toStrictEqual([]);

  const page = await openSettings(app);

  await openProfiles(page);
  await profileRow(page, "Home").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Home");
  await expect(
    page.getByRole("button", { name: "Add search", exact: true })
  ).toBeDisabled();
  await expect(badgeOf(page, "Add search")).toBeVisible();
  await expect(page.getByRole("group", { name: "Files" })).toHaveCount(0);
  await expect(
    page.getByText("You haven't saved any searches yet.")
  ).toHaveCount(0);
  await expect(
    readState<{ profiles: { savedSearches?: unknown }[] }>(userDataDir)
  ).resolves.toMatchObject({ profiles: [{ savedSearches: searches }] });

  await activate(page);
  await expect
    .poll(() => menuSearches(app))
    .toStrictEqual(["is:unread", "Files"]);
  await expect
    .poll(() => menuItem(app, "savedSearch.save"))
    .toStrictEqual({
      label: "Save Current Search",
      badge: undefined,
      enabled: true,
    });
});
