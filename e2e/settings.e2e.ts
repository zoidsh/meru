import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";
import { delay } from "es-toolkit";

import {
  clickMenuItem,
  expect,
  findPage,
  test,
  writeSettings,
  writeState,
} from "./lib/app.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";
import type { StandIn } from "./lib/stand-in.ts";

const SETTINGS_URL = "meru-app://settings/";

/** How many windows are open, the main one among them. */
const windowCount = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);

/**
 * Tells the Settings window it gained or lost focus, as the system would; the
 * suite's app is never the active app, so the system never does.
 */
const emitSettingsFocus = (app: ElectronApplication, event: "focus" | "blur") =>
  app.evaluate(
    ({ BrowserWindow }, { url, name }) => {
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL().startsWith(url))
        ?.emit(name);
    },
    { url: SETTINGS_URL, name: event }
  );

/** Whether the application menu's items are enabled, by id. */
const menuEnabled = (app: ElectronApplication, ids: readonly string[]) =>
  app.evaluate(
    ({ Menu }, itemIds) =>
      itemIds.map(
        (id) => Menu.getApplicationMenu()?.getMenuItemById(id)?.enabled
      ),
    ids
  );

/** Runs Settings… from the app menu, and gives the Settings window's page. */
const openSettings = async (app: ElectronApplication) => {
  // The menu is set once startup has wired it.
  await expect
    .poll(() =>
      app.evaluate(
        ({ Menu }) =>
          Menu.getApplicationMenu()?.getMenuItemById("app.settings") !== null
      )
    )
    .toBe(true);
  await clickMenuItem(app, "app.settings");

  const page = await findPage(app, SETTINGS_URL);

  await expect(
    page.getByRole("switch", { name: "Do Not Disturb" })
  ).toBeVisible();

  return page;
};

/** One value of `settings.json` as the app wrote it, or nothing before its first write. */
const readStoredSetting = async (userDataDir: string, key: string) => {
  let stored: Record<string, unknown> = {};

  try {
    stored = JSON.parse(
      await readFile(path.join(userDataDir, "settings.json"), "utf-8")
    ) as Record<string, unknown>;
  } catch {
    // Not written yet.
  }

  return stored[key];
};

const setSetting = (app: ElectronApplication, key: string, value: unknown) =>
  app.evaluate(
    async (_electron, change) => {
      const settings = Reflect.get(globalThis, "meruTestSettings") as {
        set: (key: string, value: unknown) => Promise<void>;
      };

      await settings.set(change.key, change.value);
    },
    { key, value }
  );

const pausedLines = (page: Page) =>
  page.getByText("Off while Do Not Disturb is on");

test("Settings… opens one Settings window, which closes and opens again", async ({
  app,
  shell,
}) => {
  await expect(shell.getByRole("banner", { name: "Title bar" })).toBeVisible();

  const page = await openSettings(app);

  await expect(
    page.getByRole("heading", { name: "Notifications" })
  ).toBeVisible();

  await clickMenuItem(app, "app.settings");

  expect(await windowCount(app)).toBe(2);

  await page.close();

  await expect.poll(() => windowCount(app)).toBe(1);

  await openSettings(app);

  expect(await windowCount(app)).toBe(2);
});

test("with Settings focused, the menu's commands on a tab are disabled, so Back leaves the front tab's page where it was, and come back once it loses focus", async ({
  app,
  standIn,
}) => {
  const gmail = await findPage(app, standIn.url);
  const later = new URL("#later", gmail.url()).href;
  const ids = ["tab.back", "tab.reload", "tab.close", "app.settings"];

  await gmail.evaluate(() => {
    history.pushState({}, "", "#later");
  });
  await expect.poll(() => menuEnabled(app, ["tab.back"])).toStrictEqual([true]);

  await openSettings(app);
  await emitSettingsFocus(app, "focus");

  await expect
    .poll(() => menuEnabled(app, ids))
    .toStrictEqual([false, false, false, true]);
  expect(gmail.url()).toBe(later);

  await emitSettingsFocus(app, "blur");

  await expect
    .poll(() => menuEnabled(app, ["tab.back", "tab.reload", "app.settings"]))
    .toStrictEqual([true, true, true]);
});

test("Ctrl+W closes the Settings window on Windows and Linux", async ({
  app,
}) => {
  test.skip(
    process.platform === "darwin",
    "macOS closes it on Cmd+W through the menu's Close Window"
  );

  const page = await openSettings(app);

  try {
    await page.keyboard.press("Control+KeyW");
  } catch {
    // The page is gone before the key comes back up; the count below is the check.
  }

  await expect.poll(() => windowCount(app)).toBe(1);
});

test("the Settings page loads and opens a menu under the strict policy with no console error", async ({
  app,
}) => {
  const page = await openSettings(app);
  const errors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  // The listeners missed the first load.
  await page.reload();
  await page.getByRole("combobox", { name: "Sound" }).click();
  await expect(page.getByRole("option", { name: "Chime" })).toBeVisible();
  await page.keyboard.press("Escape");

  expect(errors).toStrictEqual([]);
});

test("a switch writes the app value, which a restart keeps", async ({
  launchApp,
  userDataDir,
}) => {
  const app = await launchApp();
  const page = await openSettings(app);
  const summary = page.getByRole("switch", { name: "Show the summary" });

  await expect(summary).toBeChecked();

  await summary.click();

  await expect(summary).not.toBeChecked();
  await expect
    .poll(() => readStoredSetting(userDataDir, "notificationSummary"))
    .toBe(false);

  await app.close();

  const again = await openSettings(await launchApp());

  await expect(
    again.getByRole("switch", { name: "Show the summary" })
  ).not.toBeChecked();
});

test("a value set elsewhere shows in the open window", async ({ app }) => {
  const page = await openSettings(app);
  const sender = page.getByRole("switch", { name: "Show the sender" });

  await expect(sender).toBeChecked();

  await setSetting(app, "notificationSender", false);

  await expect(sender).not.toBeChecked();
});

test("Do Not Disturb from the titlebar turns the row on and pauses the rows it outranks, whose switch turns it off", async ({
  app,
  shell,
}) => {
  const page = await openSettings(app);
  const row = page.getByRole("switch", { name: "Do Not Disturb" });
  const moon = shell
    .getByRole("banner", { name: "Title bar" })
    .getByRole("button", { name: "Do Not Disturb" });

  await expect(row).not.toBeChecked();
  await expect(pausedLines(page)).toHaveCount(0);

  await moon.click();

  await expect(row).toBeChecked();
  await expect(
    page.getByText("On until you turn it off. Holds every notification.")
  ).toBeVisible();
  // Notifications, Important mail only, Sound, Volume and Quiet hours.
  await expect(pausedLines(page)).toHaveCount(5);
  await expect(
    page.getByRole("switch", { name: "Notifications" })
  ).toBeChecked();

  await row.click();

  await expect(moon).toHaveAttribute("aria-pressed", "false");
  await expect(pausedLines(page)).toHaveCount(0);
});

test("quiet hours are added, a day changed and removed, each edit writing the whole list", async ({
  app,
  userDataDir,
}) => {
  const page = await openSettings(app);
  const quietHours = () => readStoredSetting(userDataDir, "quietHours");

  await page.getByRole("button", { name: "Add quiet hours" }).click();

  const window = page.getByRole("group", { name: "Quiet hours 1" });

  // Base UI's select icon holds a "▼" that the chevron drawn over it hides.
  await expect(window.getByRole("combobox", { name: "From" })).toHaveText(
    /^22:00/u
  );
  await expect
    .poll(quietHours)
    .toStrictEqual([{ start: "22:00", end: "07:00" }]);

  await window.getByRole("button", { name: "Saturday" }).click();

  await expect(
    window.getByRole("button", { name: "Saturday" })
  ).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(quietHours)
    .toStrictEqual([
      { start: "22:00", end: "07:00", days: [0, 1, 2, 3, 4, 5] },
    ]);

  await window.getByRole("button", { name: "Remove quiet hours 1" }).click();

  await expect(window).toHaveCount(0);
  await expect.poll(quietHours).toStrictEqual([]);
});

/** Seeds `state.json` with a profile per name, each with Gmail at the stand-in. */
const seedProfiles = (
  userDataDir: string,
  standIn: StandIn,
  names: readonly string[],
  selected = 0
) => {
  const ids = names.map((name) => name.toLowerCase().replaceAll(" ", "-"));

  return writeState(userDataDir, {
    profiles: names.map((name, index) => ({
      id: ids[index],
      name,
      tabs: [{ id: "gmail", app: "gmail", url: standIn.url, title: "" }],
      selectedTabId: "gmail",
    })),
    selectedProfileId: ids[selected],
  });
};

const scopeTab = (page: Page, name: string) =>
  page
    .getByRole("tablist", { name: "Scope" })
    .getByRole("tab", { name, exact: true });

/** The profiles' own values as `settings.json` holds them. */
const storedOverrides = (userDataDir: string) =>
  readStoredSetting(userDataDir, "profiles");

/**
 * Stands in for the native confirmation of Remove Profile, which would show
 * on the desktop, answering it with its first button.
 */
const confirmRemovals = (app: ElectronApplication) =>
  app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (() =>
      Promise.resolve({
        response: 0,
        checkboxChecked: false,
      })) as unknown as typeof dialog.showMessageBox;
  });

test("with one profile there is no scope switcher, and with two it offers All profiles and each profile", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const first = await launchApp();
  const one = await openSettings(first);

  await expect(one.getByRole("tablist")).toHaveCount(0);
  await expect(one.getByText(/profile/u)).toHaveCount(0);

  await first.close();
  await seedProfiles(userDataDir, standIn, ["Home", "Work"]);

  const page = await openSettings(await launchApp());

  await expect(
    page.getByRole("tablist", { name: "Scope" }).getByRole("tab")
  ).toHaveText(["All profiles", "Home", "Work"]);
  await expect(scopeTab(page, "All profiles")).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(
    page.getByText("Every profile uses these, unless it sets its own.")
  ).toBeVisible();
});

test("in a profile's scope a switch sets the profile's own value, All profiles names it, and Use app setting removes it", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work"]);

  const page = await openSettings(await launchApp());
  const sender = page.getByRole("switch", { name: "Show the sender" });

  await scopeTab(page, "Work").click();
  await expect(
    page.getByText("Changes here apply to Work alone.")
  ).toBeVisible();
  await expect(sender).toBeChecked();
  await sender.click();

  await expect(sender).not.toBeChecked();
  await expect
    .poll(() => storedOverrides(userDataDir))
    .toStrictEqual({ work: { notificationSender: false } });
  expect(
    await readStoredSetting(userDataDir, "notificationSender")
  ).toBeUndefined();
  await expect(
    page.getByText("Set for Work. App setting is On.")
  ).toBeVisible();

  await scopeTab(page, "All profiles").click();
  await expect(sender).toBeChecked();
  await expect(page.getByText("Differs in 1 profile:")).toBeVisible();
  await page.getByRole("button", { name: "Show Work" }).click();
  await expect(scopeTab(page, "Work")).toHaveAttribute("aria-selected", "true");

  await page
    .getByRole("button", { name: "Use app setting for Show the sender" })
    .click();

  await expect(sender).toBeChecked();
  await expect.poll(() => storedOverrides(userDataDir)).toBeUndefined();
  await expect(
    page.getByRole("button", { name: /^Use app setting for/u })
  ).toHaveCount(0);

  await scopeTab(page, "All profiles").click();
  await expect(page.getByText(/^Differs in/u)).toHaveCount(0);
});

test("a profile's quiet hours are its own whole list, the app's left as it was", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work"]);

  const page = await openSettings(await launchApp());

  await scopeTab(page, "Home").click();
  await page.getByRole("button", { name: "Add quiet hours" }).click();

  await expect
    .poll(() => storedOverrides(userDataDir))
    .toStrictEqual({
      home: { quietHours: [{ start: "22:00", end: "07:00" }] },
    });
  expect(await readStoredSetting(userDataDir, "quietHours")).toBeUndefined();
  await expect(
    page.getByText("Set for Home. App setting is none.")
  ).toBeVisible();
});

test("a profile's own value set elsewhere shows in the open window", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work"]);

  const app = await launchApp();
  const page = await openSettings(app);

  await app.evaluate(async () => {
    const settings = Reflect.get(globalThis, "meruTestSettings") as {
      setOverride: (id: string, key: string, value: unknown) => Promise<void>;
    };

    await settings.setOverride("home", "notificationSound", "chime");
  });

  await expect(page.getByText("Differs in 1 profile:")).toBeVisible();
  await page.getByRole("button", { name: "Show Home" }).click();
  await expect(
    page.getByText("Set for Home. App setting is Linen.")
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Sound" })).toHaveText(
    /^Chime/u
  );
});

test("removing the profile whose scope is shown falls back to All profiles, and with one profile left to no switcher", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work", "Travel"], 1);

  const app = await launchApp();
  const page = await openSettings(app);

  await confirmRemovals(app);
  await scopeTab(page, "Work").click();
  await clickMenuItem(app, "profile.remove");

  await expect(scopeTab(page, "Work")).toHaveCount(0);
  await expect(scopeTab(page, "All profiles")).toHaveAttribute(
    "aria-selected",
    "true"
  );

  await clickMenuItem(app, "profile.remove");

  await expect(page.getByRole("tablist")).toHaveCount(0);
});

test("a scope that fell back to All profiles stays there when a profile is added", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work"]);

  const app = await launchApp();
  const page = await openSettings(app);

  await confirmRemovals(app);
  await scopeTab(page, "Work").click();
  // Removes Home, the selected profile, leaving Work alone.
  await clickMenuItem(app, "profile.remove");
  await expect(page.getByRole("tablist")).toHaveCount(0);

  await clickMenuItem(app, "profile.add");

  await expect(scopeTab(page, "All profiles")).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(scopeTab(page, "Work")).toHaveAttribute(
    "aria-selected",
    "false"
  );
});

test("long-named profiles fold into one menu beside All profiles, whose choice shows that profile's scope", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const names = [1, 2, 3, 4, 5, 6].map(
    (place) => `Rather long profile name ${place}`
  );
  const third = "Rather long profile name 3";

  await seedProfiles(userDataDir, standIn, names);

  const page = await openSettings(await launchApp());
  const menuTab = scopeTab(page, "Choose a profile");

  await expect(
    page.getByRole("tablist", { name: "Scope" }).getByRole("tab")
  ).toHaveText(["All profiles", "Choose a profile"]);
  // The unseen copy the fold is measured on widens nothing.
  expect(
    await page.getByRole("tabpanel").evaluate((panel) => {
      const scroller = panel.closest(".overflow-y-auto") ?? panel;

      return scroller.scrollWidth - scroller.clientWidth;
    })
  ).toBe(0);

  await menuTab.click();
  await page
    .getByRole("menu", { name: "Profiles" })
    .getByRole("menuitemradio", { name: third })
    .click();

  await expect(scopeTab(page, third)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(scopeTab(page, third)).toBeFocused();
  await expect(
    page.getByText(`Changes here apply to ${third} alone.`)
  ).toBeVisible();
});

test("with two profiles Do Not Disturb holds whatever a profile sets, lives under All profiles, and dims a profile's rows too", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work"]);

  const page = await openSettings(await launchApp());
  const offForAll = page.getByText("Off for all profiles");

  await expect(
    page.getByText(
      "Holds every notification, whatever a profile sets. The moon in the titlebar turns it on for a set time."
    )
  ).toBeVisible();
  await page.getByRole("switch", { name: "Do Not Disturb" }).click();
  await expect(offForAll).toHaveCount(5);

  await scopeTab(page, "Work").click();

  await expect(
    page.getByRole("switch", { name: "Do Not Disturb" })
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Do Not Disturb is the same for every profile, under All profiles."
    )
  ).toBeVisible();
  await expect(offForAll).toHaveCount(4);
});

test("one profile that holds a value of its own has the switcher until its last one goes, and All profiles changes the app value alone", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Work"]);

  const app = await launchApp();
  const page = await openSettings(app);
  const sender = page.getByRole("switch", { name: "Show the sender" });

  await expect(page.getByRole("tablist")).toHaveCount(0);
  await app.evaluate(async () => {
    const settings = Reflect.get(globalThis, "meruTestSettings") as {
      setOverride: (id: string, key: string, value: unknown) => Promise<void>;
    };

    await settings.setOverride("work", "notificationSender", false);
  });

  await expect(
    page.getByRole("tablist", { name: "Scope" }).getByRole("tab")
  ).toHaveText(["All profiles", "Work"]);
  await expect(page.getByText("Differs in 1 profile:")).toBeVisible();

  await sender.click();

  await expect(sender).not.toBeChecked();
  await expect
    .poll(() => readStoredSetting(userDataDir, "notificationSender"))
    .toBe(false);
  expect(await storedOverrides(userDataDir)).toStrictEqual({
    work: { notificationSender: false },
  });

  await scopeTab(page, "Work").click();
  await page
    .getByRole("button", { name: "Use app setting for Show the sender" })
    .click();

  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect.poll(() => storedOverrides(userDataDir)).toBeUndefined();
  await expect(page.getByText(/profile/u)).toHaveCount(0);
});

test("the volume slider writes the app volume when a drag or a key press is committed", async ({
  app,
  userDataDir,
}) => {
  const page = await openSettings(app);

  await setSetting(app, "notificationSound", "chime");
  const volume = page.getByRole("slider", { name: "Volume" });

  await expect(volume).toHaveAttribute("aria-valuetext", "100%");

  await volume.focus();
  await page.keyboard.press("ArrowLeft");

  await expect
    .poll(() => readStoredSetting(userDataDir, "notificationSoundVolume"))
    .toBe(0.95);

  const box = await page
    .getByRole("group", { name: "Volume", exact: true })
    .boundingBox();

  if (!box) {
    throw new Error("The volume slider has no box");
  }

  const y = box.y + box.height / 2;

  await page.mouse.move(box.x + box.width - 1, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 5 });
  await page.mouse.move(box.x + box.width * 0.3, y, { steps: 5 });

  await expect(volume).not.toHaveAttribute("aria-valuetext", "95%");
  expect(await readStoredSetting(userDataDir, "notificationSoundVolume")).toBe(
    0.95
  );

  await page.mouse.up();

  await expect
    .poll(() => readStoredSetting(userDataDir, "notificationSoundVolume"))
    .not.toBe(0.95);
  await expect(volume).toHaveAttribute(
    "aria-valuetext",
    `${Math.round(
      ((await readStoredSetting(
        userDataDir,
        "notificationSoundVolume"
      )) as number) * 100
    )}%`
  );
});

test("the volume is disabled while no sound of Meru's is chosen, unless a profile chooses one, and absent from a profile's scope", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work"]);

  const app = await launchApp();
  const page = await openSettings(app);
  const volume = page.getByRole("slider", { name: "Volume" });

  await setSetting(app, "notificationSound", "none");
  await expect(volume).toBeDisabled();
  await setSetting(app, "notificationSound", "system");
  await expect(volume).toBeDisabled();

  await app.evaluate(async () => {
    const settings = Reflect.get(globalThis, "meruTestSettings") as {
      setOverride: (id: string, key: string, value: unknown) => Promise<void>;
    };

    await settings.setOverride("work", "notificationSound", "knock");
  });
  await expect(volume).toBeEnabled();

  await scopeTab(page, "Work").click();
  await expect(page.getByRole("combobox", { name: "Sound" })).toBeVisible();
  await expect(volume).toHaveCount(0);
});

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("the Notifications page light and dark, with Do Not Disturb on, and with two windows of quiet hours", async ({
    launchApp,
    userDataDir,
  }) => {
    await writeSettings(userDataDir, {
      quietHours: [
        { start: "23:00", end: "07:00", days: [1, 2, 3, 4, 5] },
        { start: "00:00", end: "00:00", days: [0, 6] },
      ],
    });

    const app = await launchApp();
    const page = await openSettings(app);

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, theme);
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await page.screenshot({
        path: shotPath("settings-notifications", theme),
      });
    }

    await emulateTheme(app, "light");
    await page.getByRole("switch", { name: "Do Not Disturb" }).click();
    await expect(pausedLines(page)).toHaveCount(5);
    // Lets the switch's transition finish.
    await delay(500);
    await page.screenshot({
      path: shotPath("settings-notifications-do-not-disturb"),
    });

    await page.getByRole("switch", { name: "Do Not Disturb" }).click();
    await expect(pausedLines(page)).toHaveCount(0);
    await page
      .getByRole("group", { name: "Quiet hours 2" })
      .evaluate((group) => {
        group.scrollIntoView({ block: "center" });
      });
    await delay(500);
    await page.screenshot({
      path: shotPath("settings-notifications-quiet-hours"),
    });
  });

  test("the scope switcher light and dark: All profiles with differing rows, a profile's scope, and the folded menu open", async ({
    launchApp,
    userDataDir,
    standIn,
  }) => {
    await seedProfiles(userDataDir, standIn, ["Home", "Work", "Travel"]);
    await writeSettings(userDataDir, {
      profiles: {
        work: {
          notificationSound: "chime",
          notificationSender: false,
          quietHours: [{ start: "09:00", end: "17:00", days: [1, 2, 3, 4, 5] }],
        },
        travel: { notificationSender: false },
      },
    });

    const app = await launchApp();
    const page = await openSettings(app);

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, theme);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await scopeTab(page, "All profiles").click();
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.getByText("Differs in 2 profiles:").evaluate((line) => {
        line.scrollIntoView({ block: "center" });
      });
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.screenshot({ path: shotPath("settings-scope-all", theme) });

      // oxlint-disable-next-line no-await-in-loop -- one after another
      await scopeTab(page, "Work").click();
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page
        .getByText("Set for Work. App setting is Linen.")
        .evaluate((line) => {
          line.scrollIntoView({ block: "center" });
        });
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.screenshot({
        path: shotPath("settings-scope-profile", theme),
      });
    }

    await app.close();
    await seedProfiles(
      userDataDir,
      standIn,
      [1, 2, 3, 4, 5, 6].map((place) => `Rather long profile name ${place}`)
    );
    await writeSettings(userDataDir, {
      profiles: {
        "rather-long-profile-name-2": { notificationSender: false },
        "rather-long-profile-name-5": {
          notificationSender: false,
          unreadBadge: false,
        },
      },
    });

    const folded = await launchApp();
    const menuPage = await openSettings(folded);

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(folded, theme);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await scopeTab(menuPage, "Choose a profile").click();
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await expect(
        menuPage.getByRole("menu", { name: "Profiles" })
      ).toBeVisible();
      // Lets the menu's opening animation finish.
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await delay(500);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await menuPage.screenshot({
        path: shotPath("settings-scope-menu", theme),
      });
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await menuPage.keyboard.press("Escape");
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await expect(menuPage.getByRole("menu")).toHaveCount(0);
    }
  });
});
