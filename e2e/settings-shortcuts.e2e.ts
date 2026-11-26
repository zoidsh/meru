import type { ElectronApplication, Locator, Page } from "@playwright/test";

import { NO_TRIAL, expect, test } from "./lib/app.ts";
import { openSection, openSettings } from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";

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

/** A row's keys as shown, and as a screen reader says them, on this platform. */
const expectKeys = async (
  shown: Locator,
  keys: { mac: [string, string]; other: [string, string] }
) => {
  const [parts, spoken] = isMacOS ? keys.mac : keys.other;

  await expect(shown).toContainText(parts);
  await expect(shown).toHaveAccessibleDescription(spoken);
};

const appName = (app: ElectronApplication) =>
  app.evaluate(({ app: electron }) => electron.getName());

/** Each card's sample row, the keys it shows and says on macOS and elsewhere. */
const checkRows = async (page: Page, name: string) => {
  await expectKeys(row(card(page, name), "Settings…"), {
    mac: ["⌘,", "Command Comma"],
    other: ["Ctrl,", "Control Comma"],
  });
  await expectKeys(row(card(page, "Edit"), "Find…"), {
    mac: ["⌘F", "Command F"],
    other: ["CtrlF", "Control F"],
  });
  await expectKeys(row(card(page, "Tabs"), "New Tab…"), {
    mac: ["⌘T", "Command T"],
    other: ["CtrlT", "Control T"],
  });
  await expectKeys(row(card(page, "Tabs"), "Split Right"), {
    mac: ["⌥⌘N", "Option Command N"],
    other: ["CtrlAltN", "Control Alt N"],
  });
  await expectKeys(row(card(page, "Tabs"), "Select Pinned Tab 1 to 9"), {
    mac: ["⌃⇧9", "Control Shift 1 to Control Shift 9"],
    other: ["CtrlShift9", "Control Shift 1 to Control Shift 9"],
  });
  await expectKeys(row(card(page, "Window"), "Select Profile 1 to 9"), {
    mac: ["⌘9", "Command 1 to Command 9"],
    other:
      process.platform === "linux"
        ? ["Alt9", "Alt 1 to Alt 9"]
        : ["Ctrl9", "Control 1 to Control 9"],
  });

  const downloads = row(card(page, "View"), "Downloads");

  await expect(downloads).toContainText("None");
  await expect(downloads).toHaveAccessibleDescription("None");
};

test("sits first in Privacy & Security's group, a card per menu in the menu bar's order and the built-in keys last", async ({
  app,
}) => {
  const page = await openShortcuts(app);
  const nav = page.getByRole("navigation", { name: "Settings sections" });
  const names = await nav.getByRole("button").allTextContents();

  expect(names.slice(names.indexOf("Tabs & Apps"))).toStrictEqual([
    "Tabs & Apps",
    "Shortcuts",
    "Privacy & Security",
    "Advanced",
    "Meru Pro",
    "About",
  ]);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /reset/iu })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("textbox")).toHaveCount(0);

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

  await checkRows(page, name);

  const builtIn = card(page, "Built-in shortcuts");

  await expect(builtIn).toHaveAccessibleDescription("You can't change these.");
  await expectKeys(row(builtIn, `Quit ${name}`), {
    mac: ["⌘Q", "Command Q"],
    other: ["CtrlQ", "Control Q"],
  });
  await expectKeys(row(builtIn, "Minimize"), {
    mac: ["⌘M", "Command M"],
    other: ["CtrlM", "Control M"],
  });
  // Close has no key off macOS, where its item reads Close.
  await expect(row(builtIn, isMacOS ? "Close Window" : "Close")).toHaveCount(
    isMacOS ? 1 : 0
  );
  await expect(row(builtIn, "Undo")).toHaveCount(0);
});

test("lists the same keys on the free version, Split Right among them, with no Pro anywhere", async ({
  launchApp,
}) => {
  const app = await launchApp(NO_TRIAL);
  const page = await openShortcuts(app);

  await checkRows(page, await appName(app));
  await expect(page.getByRole("main").getByText(/\bPro\b/u)).toHaveCount(0);
});

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("the top of the page and its last cards, light and dark", async ({
    app,
  }) => {
    const page = await openShortcuts(app);
    const shoot = async (surface: string) => {
      for (const theme of THEMES) {
        // oxlint-disable-next-line no-await-in-loop -- one theme at a time
        await emulateTheme(app, theme);
        // oxlint-disable-next-line no-await-in-loop -- one after another
        await page.screenshot({ path: shotPath(surface, theme) });
      }
    };

    await shoot("settings-shortcuts");
    await card(page, "Built-in shortcuts").scrollIntoViewIfNeeded();
    await shoot("settings-shortcuts-bottom");
  });
});
