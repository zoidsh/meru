// The trial's footer, the screen at the launch after the trial ended, and
// the notice of a lapse. Each entitlement is reached through its stored file
// and the stand-in server the suite's build holds in place of the
// entitlement API: nothing here reaches the network or a browser.
import { writeFile } from "node:fs/promises";
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
  readViews,
  stubSystemBrowser,
  test,
  writeState,
} from "./lib/app.ts";
import {
  THEMES,
  emulateTheme,
  onlyWithShots,
  shootWindow,
  shotPath,
} from "./lib/shots.ts";
import type { StandIn } from "./lib/stand-in.ts";

const KEY = "MERU-TEST-AAAA-BBBB-CCCC-7Q2K";
const FOOTER_HEIGHT = 40;

type LaunchApp = (env?: Record<string, string>) => Promise<ElectronApplication>;

/** Seeds what the stand-in server remembers of this install. */
const writeStub = (userDataDir: string, record: object) =>
  writeFile(
    path.join(userDataDir, "entitlement-stub.json"),
    JSON.stringify({ licenses: {}, ...record })
  );

/** Seeds `entitlement.json`; the store's version is 1. */
const writeEntitlement = (userDataDir: string, file: object) =>
  writeFile(
    path.join(userDataDir, "entitlement.json"),
    JSON.stringify({ version: 1, ...file })
  );

/** Personal and Work, each with its Gmail tab. */
const seedProfiles = (userDataDir: string, standIn: StandIn) => {
  const gmail = {
    id: "gmail",
    app: "gmail",
    url: standIn.url,
    title: "",
    pinned: true,
    openAtLaunch: true,
  };

  return writeState(userDataDir, {
    profiles: [
      {
        id: "personal",
        name: "Personal",
        tabs: [gmail],
        selectedTabId: "gmail",
      },
      { id: "work", name: "Work", tabs: [gmail], selectedTabId: "gmail" },
    ],
    selectedProfileId: "personal",
  });
};

const snapshot = (app: ElectronApplication) =>
  app.evaluate(() =>
    (
      Reflect.get(globalThis, "meruTestEntitlement") as {
        snapshot: () => {
          status: string;
          trialChoicePending: boolean;
          downgradePending: boolean;
        };
      }
    ).snapshot()
  );

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

const viewPartitions = async (app: ElectronApplication) => {
  const { views } = await readViews(app);

  return views.map((view) => view.partition).toSorted();
};

/** The tray the app shows, if any, and how many notifications it sent. */
const readOutside = (app: ElectronApplication) =>
  app.evaluate(() => ({
    tray: Reflect.get(globalThis, "meruTestTray") !== undefined,
    notifications: (
      (Reflect.get(globalThis, "meruTestNotifications") as
        | unknown[]
        | undefined) ?? []
    ).length,
  }));

const menuLabels = (app: ElectronApplication) =>
  app.evaluate(({ Menu }) =>
    (Menu.getApplicationMenu()?.items ?? []).map((item) => item.label)
  );

/** Asks the license server again from the shell, as a refresh every few hours does. */
const refresh = (shell: Page) =>
  shell.evaluate(async () => {
    const bridge = Reflect.get(window, "meru") as {
      calls: { retryEntitlement: (request: undefined) => Promise<void> };
    };

    await bridge.calls.retryEntitlement(undefined);
  });

const setOffline = (app: ElectronApplication, offline: boolean) =>
  app.evaluate((_electron, on) => {
    process.env.MERU_STUB_OFFLINE = on ? "1" : "";
  }, offline);

const footer = (shell: Page) =>
  shell.getByRole("contentinfo", { name: "Meru Pro trial" });

const endedHeading = (shell: Page) =>
  shell.getByRole("heading", {
    level: 1,
    name: "Your Meru Pro trial has ended",
  });

/** Waits for the dialog's opening animations to end, which a picture taken at once catches midway. */
const settled = async (page: Page, name: string) => {
  const dialog = page.getByRole("dialog", { name });

  await expect(dialog).toBeVisible();
  await dialog.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map(({ finished }) => finished)
    );
  });
};

/**
 * A launch after the trial ended with no choice made yet: a first launch
 * hears from the stand-in that the trial ended, then the app is launched
 * again on what it stored. Returns how many Gmail requests the first launch
 * made, for a test to count the second's.
 */
const launchGated = async (
  launchApp: LaunchApp,
  userDataDir: string,
  standIn: StandIn,
  env: Record<string, string> = {}
) => {
  await seedProfiles(userDataDir, standIn);
  await writeStub(userDataDir, { trialStartedAt: Date.now() - 15 * DAY });

  const first = await launchApp(NO_TRIAL);

  await findPage(first, SHELL_URL);
  await expect
    .poll(() => snapshot(first))
    .toMatchObject({ status: "trialEnded", trialChoicePending: true });
  await first.close();

  const before = standIn.requests().gmail;
  const app = await launchApp({ ...NO_TRIAL, ...env });
  const shell = await findPage(app, SHELL_URL);

  await expect(endedHeading(shell)).toBeVisible();

  return { app, shell, before };
};

test("a running trial counts its days in a footer below the page, and Upgrade now opens Meru Pro's page", async ({
  app,
  shell,
  standIn,
}) => {
  await stubSystemBrowser(app);
  await findPage(app, standIn.url);
  await expect(
    footer(shell).getByText("Pro trial ends in 14 days", { exact: true })
  ).toBeVisible();

  const { content, views } = await readViews(app);
  const [view] = views;

  expect(view && view.bounds.y + view.bounds.height).toBe(
    content.height - FOOTER_HEIGHT
  );

  await footer(shell).getByRole("button", { name: "Upgrade now" }).click();
  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual([MERU_PRO_URL]);
});

for (const [days, text] of [
  [1, "Pro trial ends tomorrow"],
  [0, "Pro trial ends today"],
] as const) {
  test(`a trial ${days === 1 ? "on its last day but one" : "on its last day"} says ${text}`, async ({
    launchApp,
    userDataDir,
  }) => {
    const now = Date.now();
    const endOfToday = new Date(now).setHours(23, 59, 0, 0);
    // Midway to midnight, so the trial is still running while the test reads it.
    const ends = days === 1 ? now + DAY : now + (endOfToday - now) / 2;

    await writeStub(userDataDir, { trialStartedAt: ends - 14 * DAY });

    const app = await launchApp(NO_TRIAL);
    const shell = await findPage(app, SHELL_URL);

    await expect(footer(shell).getByText(text, { exact: true })).toBeVisible();
  });
}

test("the launch after the trial ended asks first, running nothing of any profile, and Continue with Free Version starts the first profile and is never asked again", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell, before } = await launchGated(
    launchApp,
    userDataDir,
    standIn
  );

  await expect(
    shell.getByText(
      "On the free version, Meru uses your first profile, Personal.",
      { exact: true }
    )
  ).toBeVisible();
  await expect(footer(shell)).toHaveCount(0);
  await expect(viewPartitions(app)).resolves.toStrictEqual([]);
  await expect(partitions(app)).resolves.not.toContain("personal");
  await expect(partitions(app)).resolves.not.toContain("work");
  await expect(readOutside(app)).resolves.toStrictEqual({
    tray: false,
    notifications: 0,
  });
  expect(standIn.requests().gmail).toBe(before);
  await expect(menuLabels(app)).resolves.not.toContain("View");

  await shell
    .getByRole("button", { name: "Continue with Free Version" })
    .click();
  await findPage(app, standIn.url);
  await expect(endedHeading(shell)).toHaveCount(0);
  await expect
    .poll(() => viewPartitions(app))
    .toStrictEqual(["persist:personal"]);

  const continued = await menuLabels(app);

  await app.close();

  const again = await launchApp(NO_TRIAL);
  const next = await findPage(again, SHELL_URL);

  await findPage(again, standIn.url);
  await expect(endedHeading(next)).toHaveCount(0);
  await expect(menuLabels(again)).resolves.toStrictEqual(continued);
  await expect(snapshot(again)).resolves.toMatchObject({
    status: "trialEnded",
    trialChoicePending: false,
  });
});

test("Enter License Key… on the trial-ended screen says why a key is refused, and an accepted one starts every profile at once", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launchGated(launchApp, userDataDir, standIn);
  const field = shell.getByRole("textbox", { name: "License key" });

  await shell.getByRole("button", { name: "Enter License Key…" }).click();
  await expect(
    shell.getByRole("dialog", { name: "Enter license key" })
  ).toBeVisible();
  await field.fill("MERU-0000-0000-0000-0000");
  await field.press("Enter");
  await expect(
    shell.getByText(
      "There's no license with this key. Check it and try again, or contact support.",
      { exact: true }
    )
  ).toBeVisible();
  await expect(viewPartitions(app)).resolves.toStrictEqual([]);

  await field.fill(KEY);
  await field.press("Enter");
  await expect(endedHeading(shell)).toHaveCount(0);
  await expect
    .poll(() => viewPartitions(app))
    .toStrictEqual(["persist:personal", "persist:work"]);
  await expect(snapshot(app)).resolves.toMatchObject({ status: "licensed" });
});

test("Upgrade on the trial-ended screen opens Meru Pro's page and keeps waiting", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launchGated(launchApp, userDataDir, standIn);

  await stubSystemBrowser(app);
  await shell.getByRole("button", { name: "Upgrade", exact: true }).click();
  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual([MERU_PRO_URL]);
  await expect(endedHeading(shell)).toBeVisible();
  await expect(viewPartitions(app)).resolves.toStrictEqual([]);
});

test("a refresh that brings a trial back while the screen waits starts the launch, with its footer", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launchGated(launchApp, userDataDir, standIn, {
    MERU_STUB_OFFLINE: "1",
  });

  await setOffline(app, false);
  await writeStub(userDataDir, { trialStartedAt: Date.now() });
  await refresh(shell);
  await expect(endedHeading(shell)).toHaveCount(0);
  await findPage(app, standIn.url);
  await expect(
    footer(shell).getByText("Pro trial ends in 14 days", { exact: true })
  ).toBeVisible();
});

/** Each lapse the notice tells, the stored files and launch that reach it, and what it says. */
const LAPSES = [
  {
    name: "downgrade",
    status: "trialEnded",
    seed: (userDataDir: string) =>
      writeStub(userDataDir, { trialStartedAt: Date.now() - 15 * DAY }),
    env: {},
    title: "Your trial has ended",
    description:
      "Pro features turn off when you quit Meru. Upgrade to keep them.",
    buttons: ["Not now", "Upgrade"],
  },
  {
    name: "refused",
    status: "refused",
    seed: async (userDataDir: string) => {
      await writeEntitlement(userDataDir, {
        licenseKey: KEY,
        keyStoredAt: Date.now(),
      });
      await writeStub(userDataDir, {});
    },
    env: {},
    title: "Your license can't be used",
    description:
      "Pro features turn off when you quit Meru. Contact support if you think this is a mistake.",
    buttons: ["Not now", "Upgrade"],
  },
  {
    name: "offline",
    status: "unconfirmed",
    seed: (userDataDir: string) =>
      writeEntitlement(userDataDir, {
        licenseKey: KEY,
        keyStoredAt: Date.now() - 15 * DAY,
      }),
    env: { MERU_STUB_OFFLINE: "1" },
    title: "Meru couldn't confirm your license",
    description:
      "You're using the free version until it's confirmed. Go online and try again.",
    buttons: ["Continue with free version", "Try again"],
  },
  {
    name: "clock",
    status: "unconfirmed",
    seed: (userDataDir: string) =>
      writeEntitlement(userDataDir, {
        licenseKey: KEY,
        keyStoredAt: Date.now() + 2 * DAY,
      }),
    env: { MERU_STUB_OFFLINE: "1" },
    title: "Your computer's date looks wrong",
    description:
      "Meru can't confirm Meru Pro until it's right. Set the correct date and time, then try again.",
    buttons: ["Continue with free version", "Try again"],
  },
] as const;

const launchLapsed = async (
  launchApp: LaunchApp,
  userDataDir: string,
  lapse: (typeof LAPSES)[number]
) => {
  await lapse.seed(userDataDir);

  const app = await launchApp(lapse.env);
  const shell = await findPage(app, SHELL_URL);
  const overlay = await findOverlayDocument(app);
  const notice = overlay.getByRole("dialog", { name: lapse.title });

  await expect(notice).toBeVisible();

  return { app, shell, overlay, notice };
};

for (const lapse of LAPSES) {
  test(`the main window tells once per launch: ${lapse.title}`, async ({
    launchApp,
    userDataDir,
  }) => {
    const { app, shell, notice } = await launchLapsed(
      launchApp,
      userDataDir,
      lapse
    );

    await expect(
      notice.getByText(lapse.description, { exact: true })
    ).toBeVisible();
    await expect(notice.getByRole("button")).toHaveText([...lapse.buttons]);

    const [close] = lapse.buttons;

    await notice.getByRole("button", { name: close }).click();
    await expect(notice).toHaveCount(0);
    await refresh(shell);
    await expect(notice).toHaveCount(0);
    await expect(snapshot(app)).resolves.toMatchObject({
      status: lapse.status,
    });
  });
}

test("Upgrade in the notice opens Meru Pro's page and closes it", async ({
  launchApp,
  userDataDir,
}) => {
  const [downgrade] = LAPSES;
  const { app, notice } = await launchLapsed(launchApp, userDataDir, downgrade);

  await stubSystemBrowser(app);
  await notice.getByRole("button", { name: "Upgrade" }).click();
  await expect(notice).toHaveCount(0);
  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual([MERU_PRO_URL]);
});

test("Try again in the notice closes it once the license is confirmed", async ({
  launchApp,
  userDataDir,
}) => {
  const offline = LAPSES.find(({ name }) => name === "offline");

  if (!offline) {
    throw new Error("No offline lapse");
  }

  const { app, notice } = await launchLapsed(launchApp, userDataDir, offline);

  await setOffline(app, false);
  await writeStub(userDataDir, {
    licenses: { [KEY]: { generated: "Device 4F2A" } },
  });
  await notice.getByRole("button", { name: "Try again" }).click();
  await expect(notice).toHaveCount(0);
  await expect(snapshot(app)).resolves.toMatchObject({ status: "licensed" });
});

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("the trial footer, light and dark", async ({ app, shell, standIn }) => {
    await findPage(app, standIn.url);
    await expect(footer(shell)).toBeVisible();

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, theme);
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await shootWindow(app, shell, shotPath("trial-footer", theme));
    }
  });

  test("the trial-ended screen and its key dialog with an error, light and dark", async ({
    launchApp,
    userDataDir,
    standIn,
  }) => {
    const { app, shell } = await launchGated(launchApp, userDataDir, standIn);

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, theme);
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await shootWindow(app, shell, shotPath("trial-ended", theme));
    }

    const field = shell.getByRole("textbox", { name: "License key" });

    await shell.getByRole("button", { name: "Enter License Key…" }).click();
    await field.fill("MERU-0000-0000-0000-0000");
    await field.press("Enter");
    await expect(shell.getByText(/^There's no license/u)).toBeVisible();
    await settled(shell, "Enter license key");

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, theme);
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await shootWindow(app, shell, shotPath("trial-ended-key-error", theme));
    }
  });

  for (const lapse of LAPSES) {
    test(`the ${lapse.name} notice, light and dark`, async ({
      launchApp,
      userDataDir,
      standIn,
    }) => {
      const { app, shell, overlay } = await launchLapsed(
        launchApp,
        userDataDir,
        lapse
      );

      await findPage(app, standIn.url);
      await settled(overlay, lapse.title);

      for (const theme of THEMES) {
        // oxlint-disable-next-line no-await-in-loop -- one theme at a time
        await emulateTheme(app, theme);
        // oxlint-disable-next-line no-await-in-loop -- one theme at a time
        await shootWindow(
          app,
          shell,
          shotPath(`license-notice-${lapse.name}`, theme)
        );
      }
    });
  }
});
