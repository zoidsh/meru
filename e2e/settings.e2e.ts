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
} from "./lib/app.ts";
import {
  confirmRemovals,
  emitSettingsFocus,
  menuEnabled,
  openSettings,
  scopeTab,
  seedProfiles,
} from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";

/** How many windows are open, the main one among them. */
const windowCount = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);

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

// The suite's build captures each sound on `meruTestSounds` in place of
// playing it, so nothing here is heard.
const sounds = (app: ElectronApplication) =>
  app.evaluate(() => [
    ...(Reflect.get(globalThis, "meruTestSounds") as unknown[]),
  ]);

/** What each notification the suite's notifier captured shows. */
const notifications = (app: ElectronApplication) =>
  app.evaluate(() =>
    (
      Reflect.get(globalThis, "meruTestNotifications") as {
        title: string;
        subtitle?: string;
        body: string;
        actions?: string[];
      }[]
    ).map(({ title, subtitle, body, actions }) => ({
      title,
      subtitle,
      body,
      actions,
    }))
  );

const pausedLines = (page: Page) => page.getByText("Do Not Disturb is on.");

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
  const summary = page.getByRole("switch", { name: "Show preview" });

  await expect(summary).toBeChecked();

  await summary.click();

  await expect(summary).not.toBeChecked();
  await expect
    .poll(() => readStoredSetting(userDataDir, "notificationSummary"))
    .toBe(false);

  await app.close();

  const again = await openSettings(await launchApp());

  await expect(
    again.getByRole("switch", { name: "Show preview" })
  ).not.toBeChecked();
});

test("a value set elsewhere shows in the open window", async ({ app }) => {
  const page = await openSettings(app);
  const sender = page.getByRole("switch", { name: "Show sender" });

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
    page.getByText("On until you turn it off. Silences all notifications.")
  ).toBeVisible();
  // Allow notifications, Only important mail, Sound, Volume and Quiet hours.
  await expect(pausedLines(page)).toHaveCount(5);
  await expect(
    page.getByRole("switch", { name: "Allow notifications" })
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

  await page.getByRole("button", { name: "Add", exact: true }).click();

  const window = page.getByRole("group", { name: "Quiet hours 1" });

  // Base UI's select icon holds a "▼" that the chevron drawn over it hides.
  await expect(window.getByRole("combobox", { name: "From" })).toHaveText(
    /^22:00/u
  );
  await expect
    .poll(quietHours)
    .toStrictEqual([{ start: "22:00", end: "07:00" }]);

  // A second click of a double-click would remove the window now under the
  // pointer; the change of day after it shows it removed nothing.
  await window
    .getByRole("button", { name: "Remove quiet hours 1" })
    .dispatchEvent("click", { detail: 2 });
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
/** The profiles' own values as `settings.json` holds them. */
const storedOverrides = (userDataDir: string) =>
  readStoredSetting(userDataDir, "profiles");

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
    page.getByText(
      "These apply to every profile unless you change them for one."
    )
  ).toBeVisible();
});

test("in a profile's scope a switch sets the profile's own value, All profiles names it, and Reset removes it", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work"]);

  const page = await openSettings(await launchApp());
  const sender = page.getByRole("switch", { name: "Show sender" });

  await scopeTab(page, "Work").click();
  await expect(
    page.getByText("Changes here only apply to Work.")
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
    page.getByText("Set for Work only. For all profiles, it's On.")
  ).toBeVisible();

  await scopeTab(page, "All profiles").click();
  await expect(sender).toBeChecked();
  await expect(page.getByText("Set differently for 1 profile:")).toBeVisible();
  await page.getByRole("button", { name: "Show Work" }).click();
  await expect(scopeTab(page, "Work")).toHaveAttribute("aria-selected", "true");

  await page
    .getByRole("button", { name: "Reset Show sender to All profiles" })
    .click();

  await expect(sender).toBeChecked();
  await expect.poll(() => storedOverrides(userDataDir)).toBeUndefined();
  await expect(
    page.getByRole("button", { name: /^Reset .* to All profiles$/u })
  ).toHaveCount(0);

  await scopeTab(page, "All profiles").click();
  await expect(page.getByText(/^Set differently for/u)).toHaveCount(0);
});

test("a profile's quiet hours are its own whole list, the app's left as it was", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work"]);

  const page = await openSettings(await launchApp());

  await scopeTab(page, "Home").click();
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect
    .poll(() => storedOverrides(userDataDir))
    .toStrictEqual({
      home: { quietHours: [{ start: "22:00", end: "07:00" }] },
    });
  expect(await readStoredSetting(userDataDir, "quietHours")).toBeUndefined();
  await expect(
    page.getByText("Set for Home only. For all profiles, it's none.")
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

  await expect(page.getByText("Set differently for 1 profile:")).toBeVisible();
  await page.getByRole("button", { name: "Show Home" }).click();
  await expect(
    page.getByText("Set for Home only. For all profiles, it's Linen.")
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Sound" })).toHaveText(
    /^Chime/u
  );
});

test("a profile removed in Profiles leaves the Notifications page's scopes, and with one profile left the switcher goes", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work", "Travel"], 1);

  const app = await launchApp();
  const page = await openSettings(app);
  const sections = page.getByRole("navigation", { name: "Settings sections" });
  const remove = async (name: string) => {
    await sections.getByRole("button", { name: "Profiles" }).click();
    await page
      .getByRole("list", { name: "Profiles" })
      .getByRole("button", { name, exact: true })
      .click();
    await page.getByRole("button", { name: "Remove profile…" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Profiles"
    );
    await sections.getByRole("button", { name: "Notifications" }).click();
  };

  await confirmRemovals(app);
  await remove("Work");

  await expect(scopeTab(page, "Work")).toHaveCount(0);
  await expect(scopeTab(page, "Travel")).toBeVisible();

  await remove("Travel");

  await expect(page.getByRole("tablist")).toHaveCount(0);
});

test("a profile a Gmail page adds joins the scopes, the scope shown staying", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work"]);

  const app = await launchApp();
  const gmail = await findPage(app, standIn.url);
  const page = await openSettings(app);

  await scopeTab(page, "Work").click();
  // Google's Add another account, which a profile of its own takes.
  await gmail.getByRole("link", { name: "Add another account" }).click();

  await expect(scopeTab(page, "Profile 2")).toBeVisible();
  await expect(scopeTab(page, "Work")).toHaveAttribute("aria-selected", "true");
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
    page.getByText(`Changes here only apply to ${third}.`)
  ).toBeVisible();
});

test("with two profiles Do Not Disturb holds whatever a profile sets, lives under All profiles, and dims a profile's rows too", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work"]);

  const page = await openSettings(await launchApp());
  const offForAll = page.getByText("Do Not Disturb is on.");

  await expect(
    page.getByText(
      "Silences all notifications. You can also turn it on for a while from the moon in the title bar."
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
      "You set Do Not Disturb under All profiles. It applies to every profile."
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
  const sender = page.getByRole("switch", { name: "Show sender" });

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
  await expect(page.getByText("Set differently for 1 profile:")).toBeVisible();

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
    .getByRole("button", { name: "Reset Show sender to All profiles" })
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

  await expect
    .poll(() => sounds(app))
    .toStrictEqual([{ sound: "chime", volume: 0.95 }]);

  await page.mouse.up();

  await expect
    .poll(() => readStoredSetting(userDataDir, "notificationSoundVolume"))
    .not.toBe(0.95);

  const dragged = await readStoredSetting(
    userDataDir,
    "notificationSoundVolume"
  );

  await expect
    .poll(() => sounds(app))
    .toStrictEqual([
      { sound: "chime", volume: 0.95 },
      { sound: "chime", volume: dragged },
    ]);
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

test("choosing one of Meru's sounds, Play sound and a volume commit each play the sound at the app's volume; System and None play nothing", async ({
  app,
  userDataDir,
}) => {
  const page = await openSettings(app);

  await setSetting(app, "notificationSoundVolume", 0.5);
  const sound = page.getByRole("combobox", { name: "Sound" });
  const play = page.getByRole("button", { name: "Play sound" });
  const choose = async (name: string) => {
    await sound.click();
    await page.getByRole("option", { name, exact: true }).click();
    await expect(sound).toContainText(name);
  };

  await choose("Knock");
  await expect
    .poll(() => sounds(app))
    .toStrictEqual([{ sound: "knock", volume: 0.5 }]);

  await choose("System");
  await expect(play).toBeDisabled();
  await choose("None");
  await expect(play).toBeDisabled();
  expect(await sounds(app)).toHaveLength(1);

  await choose("Duet");
  await play.click();
  await expect
    .poll(() => sounds(app))
    .toStrictEqual([
      { sound: "knock", volume: 0.5 },
      { sound: "duet", volume: 0.5 },
      { sound: "duet", volume: 0.5 },
    ]);

  await page.getByRole("slider", { name: "Volume" }).focus();
  await page.keyboard.press("ArrowRight");

  await expect.poll(() => sounds(app)).toHaveLength(4);

  const played = await sounds(app);

  expect([
    played.at(-1),
    await readStoredSetting(userDataDir, "notificationSoundVolume"),
  ]).toStrictEqual([{ sound: "duet", volume: 0.55 }, 0.55]);

  // Held, an arrow key commits each step; only the last step is heard.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");

  await expect
    .poll(() => readStoredSetting(userDataDir, "notificationSoundVolume"))
    .toBe(0.7);
  await expect.poll(() => sounds(app)).toHaveLength(5);
  await delay(500);

  const settled = await sounds(app);

  expect([settled.length, settled.at(-1)]).toStrictEqual([
    5,
    { sound: "duet", volume: 0.7 },
  ]);
});

test("with no sound of Meru's for the app, a volume commit plays the first profile's own", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work", "Club"]);
  await writeSettings(userDataDir, {
    notificationSound: "system",
    profiles: {
      home: { notificationSound: "none" },
      work: { notificationSound: "linen" },
      club: { notificationSound: "breeze" },
    },
  });

  const app = await launchApp();
  const page = await openSettings(app);

  await page.getByRole("slider", { name: "Volume" }).focus();
  await page.keyboard.press("ArrowLeft");

  await expect
    .poll(() => sounds(app))
    .toStrictEqual([{ sound: "linen", volume: 0.95 }]);
});

test("Show test notification shows the stand-in as the app's settings show mail, with its sound, even in quiet hours", async ({
  app,
}) => {
  const page = await openSettings(app);

  await page.getByRole("switch", { name: "Show sender" }).click();
  await setSetting(app, "notifications", false);
  await setSetting(app, "quietHours", [{ start: "00:00", end: "00:00" }]);
  await setSetting(app, "notificationSoundVolume", 0.4);
  await setSetting(app, "notificationSound", "breeze");
  await page.getByRole("button", { name: "Show test notification" }).click();

  await expect
    .poll(() => notifications(app))
    .toStrictEqual([
      {
        title: "New message",
        subtitle: undefined,
        body: "Your test notification request\nThis is what a new email notification looks like.",
        actions: undefined,
      },
    ]);
  expect(await sounds(app)).toStrictEqual([{ sound: "breeze", volume: 0.4 }]);
});

test("under Do Not Disturb Show test notification is disabled, says why to the pointer, the keyboard and assistive technology, and shows nothing", async ({
  app,
}) => {
  const page = await openSettings(app);
  const errors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  const button = page.getByRole("button", { name: "Show test notification" });
  const reason = "Turn off Do Not Disturb first.";

  await expect(button).toBeEnabled();
  await page.getByRole("switch", { name: "Do Not Disturb" }).click();

  await expect(button).toBeDisabled();
  await expect(button).toHaveAccessibleDescription(reason);

  const tooltip = page.getByRole("tooltip");

  await expect(tooltip).toHaveCount(0);
  await button.hover();
  await expect(tooltip).toHaveText(reason);
  await button.click({ force: true });

  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);
  await page.getByRole("button", { name: "Add", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  await expect(tooltip).toHaveText(reason);
  await page.keyboard.press("Enter");

  expect([await notifications(app), errors]).toStrictEqual([[], []]);

  await page.getByRole("switch", { name: "Do Not Disturb" }).click();
  await expect(button).toBeEnabled();
});

test("in a profile's scope the test notification is that profile's, as its own settings show mail", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work"]);
  await writeSettings(userDataDir, {
    profiles: { work: { notificationSubject: false } },
  });

  const app = await launchApp();
  const page = await openSettings(app);

  await scopeTab(page, "Work").click();
  await page.getByRole("button", { name: "Show test notification" }).click();

  const summary = "This is what a new email notification looks like.";

  await expect
    .poll(() => notifications(app))
    .toStrictEqual([
      process.platform === "darwin"
        ? {
            title: "Tim from Meru",
            subtitle: "Work",
            body: summary,
            actions: undefined,
          }
        : {
            title: "Tim from Meru",
            subtitle: undefined,
            body: `Work\n${summary}`,
            actions: undefined,
          },
    ]);
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
      await page
        .getByText("Set differently for 2 profiles:")
        .evaluate((line) => {
          line.scrollIntoView({ block: "center" });
        });
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.screenshot({ path: shotPath("settings-scope-all", theme) });

      // oxlint-disable-next-line no-await-in-loop -- one after another
      await scopeTab(page, "Work").click();
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page
        .getByText("Set for Work only. For all profiles, it's Linen.")
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

  test("the New mail card with Volume, Play sound and Test notification, and one profile that holds a value of its own, light and dark", async ({
    launchApp,
    userDataDir,
    standIn,
  }) => {
    await seedProfiles(userDataDir, standIn, ["Work"]);
    await writeSettings(userDataDir, {
      notificationSound: "chime",
      notificationSoundVolume: 0.6,
    });

    const app = await launchApp();
    const page = await openSettings(app);

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, theme);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.getByText("Volume").evaluate((label) => {
        label.scrollIntoView({ block: "center" });
      });
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.screenshot({ path: shotPath("settings-new-mail", theme) });
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page
        .getByRole("button", { name: "Show test notification" })
        .evaluate((button) => {
          button.scrollIntoView({ block: "center" });
        });
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.screenshot({
        path: shotPath("settings-test-notification", theme),
      });
    }

    await app.evaluate(async () => {
      const settings = Reflect.get(globalThis, "meruTestSettings") as {
        setOverride: (id: string, key: string, value: unknown) => Promise<void>;
      };

      await settings.setOverride("work", "notificationSound", "knock");
    });

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, theme);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await scopeTab(page, "All profiles").click();
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.getByRole("tablist", { name: "Scope" }).evaluate((tabs) => {
        // To the top of the page, which scrolls in its own box.
        for (let box = tabs.parentElement; box; box = box.parentElement) {
          box.scrollTop = 0;
        }
      });
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await expect(
        page.getByText("Set differently for 1 profile:")
      ).toBeVisible();
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.screenshot({ path: shotPath("settings-scope-lone", theme) });
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await scopeTab(page, "Work").click();
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page
        .getByText("Set for Work only. For all profiles, it's Chime.")
        .evaluate((line) => {
          line.scrollIntoView({ block: "center" });
        });
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.screenshot({
        path: shotPath("settings-scope-lone-profile", theme),
      });
    }

    await scopeTab(page, "All profiles").click();
    await page.getByRole("switch", { name: "Do Not Disturb" }).click();

    const button = page.getByRole("button", { name: "Show test notification" });

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, theme);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await button.evaluate((element) => {
        element.scrollIntoView({ block: "center" });
      });
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await button.hover();
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await expect(page.getByRole("tooltip")).toBeVisible();
      // Lets the tooltip's opening animation finish.
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await delay(500);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.screenshot({
        path: shotPath("settings-test-notification-blocked", theme),
      });
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.mouse.move(0, 0);
    }
  });
});
