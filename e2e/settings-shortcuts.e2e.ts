import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Locator, Page } from "@playwright/test";

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
import { KEYS, pressInPage } from "./lib/keys.ts";
import type { Key } from "./lib/keys.ts";
import {
  SETTINGS_URL,
  emitSettingsFocus,
  openSection,
  openSettings,
} from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";
import type { StandIn } from "./lib/stand-in.ts";

const isMacOS = process.platform === "darwin";

const openShortcuts = async (app: ElectronApplication) => {
  const page = await openSettings(app);

  await openSection(page, "Shortcuts");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shortcuts");

  return page;
};

const card = (page: Page, name: string) =>
  page.getByRole("main").getByRole("group", { name, exact: true });

const row = (group: Locator, name: string) =>
  group.getByRole("group", { name, exact: true });

/**
 * A row's keys as shown, and as a screen reader says them, on this
 * platform: in the button that records a new key where the row has one,
 * named by the row's title and the keys, else in the row's description.
 */
const expectKeys = async (
  shown: Locator,
  title: string,
  keys: { mac: [string, string]; other: [string, string] },
  changeable: boolean
) => {
  const [parts, spoken] = isMacOS ? keys.mac : keys.other;

  await expect(shown).toContainText(parts);

  await (changeable
    ? expect(shown.getByRole("button")).toHaveAccessibleName(
        `${title} ${spoken}`
      )
    : expect(shown).toHaveAccessibleDescription(spoken));
};

const appName = (app: ElectronApplication) =>
  app.evaluate(({ app: electron }) => electron.getName());

/** Each card's sample row, the keys it shows and says on macOS and elsewhere. */
const checkRows = async (page: Page, name: string, changeable: boolean) => {
  const sample = (
    menu: string,
    title: string,
    keys: Parameters<typeof expectKeys>[2]
  ) => expectKeys(row(card(page, menu), title), title, keys, changeable);
  const range = (
    menu: string,
    title: string,
    keys: Parameters<typeof expectKeys>[2]
  ) => expectKeys(row(card(page, menu), title), title, keys, false);

  await sample(name, "Settings…", {
    mac: ["⌘,", "Command Comma"],
    other: ["Ctrl,", "Control Comma"],
  });
  await sample("Edit", "Find…", {
    mac: ["⌃⇧⌘F", "Control Shift Command F"],
    other: ["F3", "F3"],
  });
  await sample("Tabs", "New Tab…", {
    mac: ["⌘T", "Command T"],
    other: ["CtrlT", "Control T"],
  });
  await sample("Tabs", "Split Right", {
    mac: ["⌥⌘N", "Option Command N"],
    other: ["CtrlAltShiftV", "Control Alt Shift V"],
  });
  await range("Tabs", "Select Pinned Tab 1 to 9", {
    mac: ["⌃⌥9", "Control Option 1 to Control Option 9"],
    other: ["CtrlAltShift9", "Control Alt Shift 1 to Control Alt Shift 9"],
  });
  await range("Window", "Select Profile 1 to 9", {
    mac: ["⌃⌘9", "Control Command 1 to Control Command 9"],
    other: ["Ctrl9", "Control 1 to Control 9"],
  });
  await sample("View", "Downloads", {
    mac: ["⌃⇧J", "Control Shift J"],
    other: ["AltShiftJ", "Alt Shift J"],
  });
  await sample("View", "Back", {
    mac: ["⌃⌘[", "Control Command Left Bracket"],
    other: ["CtrlAltLeft", "Control Alt Left Arrow"],
  });

  const stop = row(card(page, "View"), "Stop");

  await expect(stop).toContainText("None");
  await (changeable
    ? expect(stop.getByRole("button")).toHaveAccessibleName("Stop None")
    : expect(stop).toHaveAccessibleDescription("None"));
};

/** A key no Meru command and no Google app holds on this platform. */
const FREE_KEY = isMacOS
  ? {
      press: "Alt+Meta+KeyK",
      accelerator: "Alt+Command+K",
      shown: "⌥⌘K",
      spoken: "Option Command K",
      key: { keyCode: "K", modifiers: ["alt", "meta"] } satisfies Key,
    }
  : {
      press: "Control+Alt+Shift+KeyL",
      accelerator: "Control+Alt+Shift+L",
      shown: "Ctrl+Alt+Shift+L",
      spoken: "Control Alt Shift L",
      key: {
        keyCode: "L",
        modifiers: ["control", "alt", "shift"],
      } satisfies Key,
    };

/**
 * Types the free key into the recorder. On macOS it arrives as Chromium
 * there sends it, Option changing the K to ˚ though Command is held, which
 * Playwright's own press, giving k, never shows.
 */
const typeFreeKey = async (page: Page) => {
  if (!isMacOS) {
    await page.keyboard.press(FREE_KEY.press);

    return;
  }

  const cdp = await page.context().newCDPSession(page);
  // Alt is 1 and Meta 4 in CDP's modifiers.
  const event = {
    key: "˚",
    code: "KeyK",
    modifiers: 5,
    windowsVirtualKeyCode: 75,
  };

  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...event });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
  await cdp.detach();
};

/** A key Google Chat uses, and no Meru command. */
const CHAT_KEY = isMacOS
  ? {
      press: "Meta+KeyJ",
      accelerator: "Command+J",
      key: { keyCode: "J", modifiers: ["meta"] } satisfies Key,
    }
  : {
      press: "Control+KeyJ",
      accelerator: "Control+J",
      key: { keyCode: "J", modifiers: ["control"] } satisfies Key,
    };

const RELOAD_DEFAULT = isMacOS ? "⌃⇧R" : "F5";

const reloadRow = (page: Page) => row(card(page, "View"), "Reload");

const reloadButton = (page: Page) =>
  reloadRow(page).getByRole("button", { name: /^Reload /u });

/** The item's key in the application menu, `null` for none, once the menu is set. */
const menuAccelerator = (app: ElectronApplication, id: string) =>
  app.evaluate(({ Menu }, itemId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(itemId);

    return item ? (item.accelerator ?? null) : "no item yet";
  }, id);

/** A launch whose trial the stand-in remembers as ended, so the run is free. */
const launchFree = async (
  launchApp: (env?: Record<string, string>) => Promise<ElectronApplication>,
  userDataDir: string
) => {
  await writeFile(
    path.join(userDataDir, "entitlement-stub.json"),
    JSON.stringify({ trialStartedAt: Date.now() - 15 * DAY, licenses: {} })
  );

  const app = await launchApp(NO_TRIAL);

  await expect
    .poll(() =>
      app.evaluate(
        () =>
          // Set once startup has made the entitlement.
          (
            Reflect.get(globalThis, "meruTestEntitlement") as
              | { snapshot: () => { status: string } }
              | undefined
          )?.snapshot().status
      )
    )
    .toBe("trialEnded");

  return app;
};

/** Clicks Reload's key and waits until main records it. */
const startRecording = async (page: Page) => {
  await reloadButton(page).click();
  await expect(reloadButton(page)).toHaveText("Type shortcut…");
  // The Google note, should the key have one, stays after the hint.
  await expect(reloadButton(page)).toHaveAccessibleDescription(
    /^Type the new shortcut\. Press Escape to cancel or Delete to clear it\./u
  );
};

const expectNotRecording = (page: Page) =>
  expect(reloadButton(page)).not.toHaveText("Type shortcut…");

const seedGmail = (userDataDir: string, standIn: StandIn) =>
  writeState(userDataDir, {
    profiles: [
      {
        id: "p",
        name: "Default",
        tabs: [{ id: "gmail", app: "gmail", url: standIn.url, title: "" }],
        selectedTabId: "gmail",
      },
    ],
    selectedProfileId: "p",
  });

/**
 * The stand-in's page holding Chromium's focus, so keys sent it reach it,
 * keeping each key it hears on `seenKeys` until it loads again.
 */
const listenInGmail = async (app: ElectronApplication, standIn: StandIn) => {
  const gmail = await findPage(app, standIn.url);
  const cdp = await gmail.context().newCDPSession(gmail);

  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await expect.poll(() => gmail.evaluate(() => document.hasFocus())).toBe(true);
  await gmail.evaluate(() => {
    const seen: string[] = [];

    Reflect.set(globalThis, "seenKeys", seen);
    document.addEventListener("keydown", (event) => {
      seen.push(event.key.toLowerCase());
    });
  });

  return gmail;
};

const seenKeys = (gmail: Page) =>
  gmail
    .evaluate(() => Reflect.get(globalThis, "seenKeys") as string[] | undefined)
    // Asked mid-load, the page has no context to answer from.
    .catch(() => "loading");

const storedShortcuts = async (userDataDir: string) =>
  (
    JSON.parse(
      await readFile(path.join(userDataDir, "settings.json"), "utf-8")
    ) as { customShortcuts?: unknown }
  ).customShortcuts;

test("sits first in Privacy & Security's group, a card per menu in the menu bar's order and the built-in keys last", async ({
  app,
}) => {
  const page = await openShortcuts(app);
  const nav = page.getByRole("navigation", { name: "Settings sections" });
  const names = await nav.getByRole("button").allTextContents();

  expect(names.slice(names.indexOf("Tabs & Google Apps"))).toStrictEqual([
    "Tabs & Google Apps",
    "Shortcuts",
    "Privacy & Security",
    "Advanced",
    "Meru Pro",
    "About",
  ]);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /reset/iu })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("textbox")).toHaveCount(0);
  await expect(
    page.getByText("Click a shortcut and type the keys you want to use.")
  ).toBeVisible();

  const name = await appName(app);
  const cards = [
    name,
    "Edit",
    "View",
    "Mail",
    "Tabs",
    "Window",
    "Built-in shortcuts",
  ];
  const tops: number[] = [];

  for (const title of cards) {
    // oxlint-disable-next-line no-await-in-loop -- in the page's order
    const box = await card(page, title).boundingBox();

    tops.push(box?.y ?? Number.NaN);
  }

  expect(tops).toStrictEqual(tops.toSorted((a, b) => a - b));
  expect(new Set(tops).size).toBe(cards.length);

  await checkRows(page, name, true);

  const builtIn = card(page, "Built-in shortcuts");

  await expect(builtIn).toHaveAccessibleDescription("You can't change these.");
  await expect(builtIn.getByRole("button")).toHaveCount(0);
  await expectKeys(
    row(builtIn, `Quit ${name}`),
    `Quit ${name}`,
    { mac: ["⌘Q", "Command Q"], other: ["CtrlQ", "Control Q"] },
    false
  );
  await expectKeys(
    row(builtIn, "Minimize"),
    "Minimize",
    { mac: ["⌘M", "Command M"], other: ["CtrlM", "Control M"] },
    false
  );
  // Close has no key off macOS, where its item reads Close.
  await expect(row(builtIn, isMacOS ? "Close Window" : "Close")).toHaveCount(
    isMacOS ? 1 : 0
  );
  await expect(row(builtIn, "Undo")).toHaveCount(0);
  await expect(
    row(card(page, "Window"), "Select Profile 1 to 9").getByRole("button")
  ).toHaveCount(0);
});

test("records a new key for Reload, which the menu, the title bar's tooltip and the page show, and which a relaunch keeps: the new key reloads and the old one reaches the page", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seedGmail(userDataDir, standIn);

  let app = await launchApp();
  const page = await openShortcuts(app);

  await startRecording(page);
  await typeFreeKey(page);

  await expect(reloadButton(page)).toHaveAccessibleName(
    `Reload ${FREE_KEY.spoken}`
  );
  await expect(reloadButton(page)).toHaveAccessibleDescription(
    `The default is ${RELOAD_DEFAULT}.`
  );
  await expect(reloadButton(page)).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Reset Reload to its default" })
  ).toBeVisible();
  await expect
    .poll(() => menuAccelerator(app, "tab.reload"))
    .toBe(FREE_KEY.accelerator);

  const shell = await findPage(app, SHELL_URL);

  await expect(shell.getByRole("button", { name: "Reload" })).toHaveAttribute(
    "title",
    `Reload (${FREE_KEY.shown})`
  );
  await expect
    .poll(() => storedShortcuts(userDataDir))
    .toStrictEqual({
      [process.platform]: { "tab.reload": FREE_KEY.accelerator },
    });

  await app.close();
  app = await launchApp();

  await expect
    .poll(() => menuAccelerator(app, "tab.reload"))
    .toBe(FREE_KEY.accelerator);

  const gmail = await listenInGmail(app, standIn);

  await pressInPage(app, standIn.url, KEYS.reload);
  await expect
    .poll(() => seenKeys(gmail))
    .toStrictEqual([KEYS.reload.keyCode.toLowerCase()]);

  await pressInPage(app, standIn.url, FREE_KEY.key);
  await expect.poll(() => seenKeys(gmail)).toBeUndefined();
});

test("refuses a key another command holds, naming it, and changes nothing", async ({
  app,
}) => {
  const page = await openShortcuts(app);

  await startRecording(page);
  await page.keyboard.press(isMacOS ? "Meta+Comma" : "Control+Comma");

  const error = isMacOS
    ? "⌘, is already used for Settings."
    : "Ctrl+, is already used for Settings.";

  await expect(reloadRow(page).getByRole("alert")).toHaveText(error);
  await expect(reloadButton(page)).toHaveAccessibleDescription(error);
  await expect(reloadButton(page)).toHaveAttribute("aria-invalid", "true");
  await expectNotRecording(page);
  expect(await menuAccelerator(app, "tab.reload")).toBe(
    isMacOS ? "Control+Shift+R" : "F5"
  );

  // A shortcut needs more than Shift.
  await startRecording(page);
  await expect(reloadRow(page).getByRole("alert")).toHaveCount(0);
  await page.keyboard.press("Shift+KeyR");
  await expect(reloadRow(page).getByRole("alert")).toHaveText(
    isMacOS ? "Shortcuts need ⌘, ⌃ or ⌥." : "Shortcuts need Ctrl or Alt."
  );
  await expectNotRecording(page);
});

test("leaves Reload with no key on Delete, and Reset gives the default back", async ({
  app,
}) => {
  const page = await openShortcuts(app);

  await startRecording(page);
  await page.keyboard.press("Delete");

  await expect(reloadButton(page)).toHaveAccessibleName("Reload None");
  await expect(reloadButton(page)).toHaveAccessibleDescription(
    `The default is ${RELOAD_DEFAULT}.`
  );
  await expect.poll(() => menuAccelerator(app, "tab.reload")).toBeNull();

  const reset = page.getByRole("button", {
    name: "Reset Reload to its default",
  });

  await reset.click();

  await expect(reset).toHaveCount(0);
  await expect(reloadButton(page)).toHaveAccessibleName(
    `Reload ${isMacOS ? "Control Shift R" : "F5"}`
  );
  await expect(reloadButton(page)).toHaveAccessibleDescription("");
  await expect
    .poll(() => menuAccelerator(app, "tab.reload"))
    .toBe(isMacOS ? "Control+Shift+R" : "F5");

  // Escape cancels, keeping the key.
  await startRecording(page);
  await page.keyboard.press("Escape");
  await expectNotRecording(page);
  await expect(reloadButton(page)).toHaveAccessibleName(
    `Reload ${isMacOS ? "Control Shift R" : "F5"}`
  );
});

test("notes the Google app that shares a key a person set, which Meru hears before the page", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seedGmail(userDataDir, standIn);
  await writeSettings(userDataDir, {
    customShortcuts: {
      [process.platform]: { "tab.reload": CHAT_KEY.accelerator },
    },
  });

  const app = await launchApp();
  const gmail = await listenInGmail(app, standIn);

  await pressInPage(app, standIn.url, CHAT_KEY.key);
  await expect.poll(() => seenKeys(gmail)).toBeUndefined();

  const page = await openShortcuts(app);

  await expect(reloadRow(page)).toContainText(
    "Chat also uses this key. Meru's shortcut will win."
  );
  await expect(reloadButton(page)).toHaveAccessibleDescription(
    `The default is ${RELOAD_DEFAULT}. Chat also uses this key. Meru's shortcut will win.`
  );
});

// The menu itself never hears a synthesized key, on macOS or Linux, so that
// it ignores a key typed while recording is a check by hand.
test("takes the window's close and quit keys typed into the recorder as keys to record, refused and named, the window left open", async ({
  app,
}) => {
  const page = await openShortcuts(app);
  const name = await appName(app);

  await startRecording(page);
  await page.keyboard.press(isMacOS ? "Meta+KeyW" : "Control+KeyW");

  // Close has no key off macOS, so the key is Reload's there.
  await (isMacOS
    ? expect(reloadRow(page).getByRole("alert")).toHaveText(
        "⌘W is already used for Close Window."
      )
    : expect(reloadButton(page)).toHaveAccessibleName("Reload Control W"));

  await startRecording(page);
  await page.keyboard.press(isMacOS ? "Meta+KeyQ" : "Control+KeyQ");
  await expect(reloadRow(page).getByRole("alert")).toHaveText(
    `${isMacOS ? "⌘Q" : "Ctrl+Q"} is already used for Quit ${name}.`
  );

  expect(
    await app.evaluate(
      ({ BrowserWindow }, url) =>
        BrowserWindow.getAllWindows().some((window) =>
          window.webContents.getURL().startsWith(url)
        ),
      SETTINGS_URL
    )
  ).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shortcuts");
});

test("ends recording, the key kept, when the window loses the keys, hides, or Tab moves on", async ({
  app,
}) => {
  const page = await openShortcuts(app);
  const kept = `Reload ${isMacOS ? "Control Shift R" : "F5"}`;

  await startRecording(page);
  await emitSettingsFocus(app, "blur");
  await expectNotRecording(page);
  await expect(reloadButton(page)).toHaveAccessibleName(kept);

  await startRecording(page);
  await page.keyboard.press("Tab");
  await expectNotRecording(page);
  await expect(reloadButton(page)).not.toBeFocused();

  await startRecording(page);
  await app.evaluate(({ BrowserWindow }, url) => {
    const window = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().startsWith(url)
    );

    window?.hide();
    // macOS tells of a hide by the window's occlusion changing, which a
    // window other test apps already cover never does.
    window?.emit("hide");
    // A hidden window draws no frames, which Playwright's waits poll on, so
    // the page is read with the window shown again, without the focus.
    window?.showInactive();
  }, SETTINGS_URL);
  await expectNotRecording(page);
  await expect(reloadButton(page)).toHaveAccessibleName(kept);
  expect(await menuAccelerator(app, "tab.reload")).toBe(
    isMacOS ? "Control+Shift+R" : "F5"
  );
});

test("on the free version lists the keys with one Meru Pro badge, records nothing and applies no stored key", async ({
  launchApp,
  userDataDir,
}) => {
  await writeSettings(userDataDir, {
    customShortcuts: {
      [process.platform]: { "tab.reload": FREE_KEY.accelerator },
    },
  });

  const app = await launchFree(launchApp, userDataDir);
  const page = await openShortcuts(app);
  const main = page.getByRole("main");

  await checkRows(page, await appName(app), false);
  await expect(main.getByRole("button", { name: /^Meru Pro/u })).toHaveCount(1);
  await expect(
    main.getByRole("button", {
      name: "Meru Pro Click a shortcut and type the keys you want to use.",
    })
  ).toBeVisible();
  await expect(reloadRow(page).getByRole("button")).toHaveCount(0);
  await expect(reloadRow(page)).toHaveAccessibleDescription(
    isMacOS ? "Control Shift R" : "F5"
  );
  await expect(main.getByRole("button", { name: /reset/iu })).toHaveCount(0);
  expect(await menuAccelerator(app, "tab.reload")).toBe(
    isMacOS ? "Control+Shift+R" : "F5"
  );
  // Kept for a license.
  expect(await storedShortcuts(userDataDir)).toStrictEqual({
    [process.platform]: { "tab.reload": FREE_KEY.accelerator },
  });
});

const shoot = async (app: ElectronApplication, page: Page, surface: string) => {
  for (const theme of THEMES) {
    // oxlint-disable-next-line no-await-in-loop -- one theme at a time
    await emulateTheme(app, theme);
    // oxlint-disable-next-line no-await-in-loop -- one after another
    await page.screenshot({ path: shotPath(surface, theme) });
  }
};

/** Brings a card to the top of the page. */
const showCard = (page: Page, menu: string) =>
  card(page, menu).evaluate((element) => {
    element.scrollIntoView({ block: "start" });
    // Which scrolls the window too, which never scrolls by itself.
    document.scrollingElement?.scrollTo(0, 0);
  });

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("the top of the page and its last cards, light and dark", async ({
    app,
  }) => {
    const page = await openShortcuts(app);

    await shoot(app, page, "settings-shortcuts");

    for (const menu of ["View", "Tabs", "Window"]) {
      // oxlint-disable-next-line no-await-in-loop -- one card after another
      await showCard(page, menu);
      // oxlint-disable-next-line no-await-in-loop -- one card after another
      await shoot(app, page, `settings-shortcuts-${menu.toLowerCase()}`);
    }

    await card(page, "Built-in shortcuts").scrollIntoViewIfNeeded();
    await shoot(app, page, "settings-shortcuts-bottom");
  });

  test("a changed key, recording, a conflict, the Google note and a cleared key, light and dark", async ({
    app,
  }) => {
    const page = await openShortcuts(app);

    await startRecording(page);
    await page.keyboard.press(FREE_KEY.press);
    await expect(reloadButton(page)).toHaveAccessibleName(
      `Reload ${FREE_KEY.spoken}`
    );
    await showCard(page, "View");
    await shoot(app, page, "settings-shortcuts-changed");

    await startRecording(page);
    await shoot(app, page, "settings-shortcuts-recording");

    await page.keyboard.press(isMacOS ? "Meta+Comma" : "Control+Comma");
    await expect(reloadRow(page).getByRole("alert")).toBeVisible();
    await shoot(app, page, "settings-shortcuts-conflict");

    await startRecording(page);
    await page.keyboard.press(CHAT_KEY.press);
    await expect(reloadRow(page)).toContainText("Chat also uses this key.");
    await shoot(app, page, "settings-shortcuts-google");

    await startRecording(page);
    await page.keyboard.press("Delete");
    await expect(reloadButton(page)).toHaveAccessibleName("Reload None");
    await shoot(app, page, "settings-shortcuts-cleared");
  });

  test("the free version, light and dark", async ({
    launchApp,
    userDataDir,
  }) => {
    const app = await launchFree(launchApp, userDataDir);
    const page = await openShortcuts(app);

    await shoot(app, page, "settings-shortcuts-free");
  });
});
