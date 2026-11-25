import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Page } from "@playwright/test";

import { expect, findPage, test, writeSettings } from "./lib/app.ts";
import { openSection, openSettings, switchNamed } from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";
import { GMAIL_PARTS } from "./lib/stand-in.ts";

/** `settings.json` as the app wrote it, or nothing before its first write. */
const readStored = async (userDataDir: string) => {
  try {
    return JSON.parse(
      await readFile(path.join(userDataDir, "settings.json"), "utf-8")
    ) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const storedValue = async (userDataDir: string, key: string) => {
  const stored = await readStored(userDataDir);

  return stored[key];
};

/** Each switch of the page by its label, with the key it shows, in the page's order. */
const SWITCHES = [
  ["Hide Gmail logo", "hideGmailLogo"],
  ["Hide promotions", "hidePromoBanner"],
  ["Hide Upgrade button", "hideUpgradeButton"],
  ["Hide inbox footer", "hideInboxFooter"],
  ["Dark theme for all of Gmail", "extendDarkTheme"],
  ["Newest message first", "reverseConversation"],
  ["Show attachments first", "moveAttachmentsToTop"],
  ["Show trimmed content", "showTrimmedContent"],
  ["Find verification codes", "verificationCodes"],
  ["Mark as read after copying", "verificationCodeMarkRead"],
  ["Move to Trash after copying", "verificationCodeTrash"],
] as const;

const CODES_OFF = "Turn on Find verification codes first.";

const copyMode = (page: Page) =>
  page.getByRole("combobox", { name: "Copy code" });

const openGmail = async (page: Page) => {
  await openSection(page, "Gmail");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Gmail");
};

test("opens from the sidebar and by search, and Back returns to the page before", async ({
  app,
}) => {
  const page = await openSettings(app);
  const sections = page.getByRole("navigation", { name: "Settings sections" });

  await openGmail(page);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByRole("main").getByText(/profile/iu)).toHaveCount(0);

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Notifications"
  );

  await page.getByRole("searchbox", { name: "Search settings" }).fill("gmail");
  await expect(sections.getByRole("button")).toHaveText(["Gmail"]);
  await sections.getByRole("button", { name: "Gmail" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Gmail");
});

test("each card is a group its heading names, holding its rows", async ({
  app,
}) => {
  const page = await openSettings(app);

  await openGmail(page);

  for (const [group, label] of [
    ["Gmail page", "Hide Gmail logo"],
    ["Conversations", "Show trimmed content"],
    ["Verification codes", "Move to Trash after copying"],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one group after another
    await expect(
      page
        .getByRole("group", { name: group })
        .getByRole("switch", { name: label })
    ).toBeVisible();
  }

  await expect(
    page.getByRole("group", { name: "Gmail page" })
  ).toHaveAccessibleDescription(
    "These change how Gmail looks in Meru. Your Gmail settings stay the same."
  );
});

test("each switch shows the stored value and writes the one it is turned to", async ({
  launchApp,
  userDataDir,
}) => {
  await writeSettings(userDataDir, {
    hidePromoBanner: false,
    reverseConversation: true,
    verificationCodeTrash: true,
  });

  const app = await launchApp();
  const page = await openSettings(app);
  const stored = {
    hideGmailLogo: true,
    hidePromoBanner: false,
    hideUpgradeButton: true,
    hideInboxFooter: true,
    extendDarkTheme: true,
    reverseConversation: true,
    moveAttachmentsToTop: false,
    showTrimmedContent: false,
    verificationCodes: true,
    verificationCodeMarkRead: false,
    verificationCodeTrash: true,
  };

  await openGmail(page);

  for (const [label, key] of SWITCHES) {
    // oxlint-disable-next-line no-await-in-loop -- one row after another
    await expect(switchNamed(page, label)).toBeChecked({
      checked: stored[key],
    });
  }

  // Find verification codes last, since the rows under it are disabled once it is off.
  const codesLast = SWITCHES.toSorted(
    ([, a], [, b]) =>
      Number(a === "verificationCodes") - Number(b === "verificationCodes")
  );

  for (const [label] of codesLast) {
    // oxlint-disable-next-line no-await-in-loop -- one write after another
    await switchNamed(page, label).click();
  }

  await expect
    .poll(async () => {
      const written = await readStored(userDataDir);

      return Object.fromEntries(SWITCHES.map(([, key]) => [key, written[key]]));
    })
    .toStrictEqual(
      Object.fromEntries(SWITCHES.map(([, key]) => [key, !stored[key]]))
    );
});

test("a hide switched off shows Gmail's logo on the page while it stays loaded, and on hides it again", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);
  const logo = view.getByRole("img", { name: GMAIL_PARTS.logo });

  await expect(logo).toBeHidden();
  await view.evaluate(() => {
    Reflect.set(window, "keptAcrossSettings", true);
  });

  const page = await openSettings(app);

  await openGmail(page);
  await switchNamed(page, "Hide Gmail logo").click();
  await expect(logo).toBeVisible();
  await switchNamed(page, "Hide Gmail logo").click();
  await expect(logo).toBeHidden();
  expect(
    await view.evaluate(() => Reflect.get(window, "keptAcrossSettings"))
  ).toBe(true);
});

test("Copy code shows the stored mode and writes the one chosen", async ({
  app,
  userDataDir,
}) => {
  const page = await openSettings(app);

  await openGmail(page);
  await expect(copyMode(page)).toContainText("When you click Copy");
  await copyMode(page).click();
  await page.getByRole("option", { name: "As soon as it arrives" }).click();

  await expect(copyMode(page)).toContainText("As soon as it arrives");
  await expect
    .poll(() => storedValue(userDataDir, "verificationCodeCopyMode"))
    .toBe("immediately");
});

test("with codes off the three rows under it are disabled and say why, and come back with their values", async ({
  launchApp,
  userDataDir,
}) => {
  await writeSettings(userDataDir, {
    verificationCodeCopyMode: "immediately",
    verificationCodeMarkRead: true,
  });

  const app = await launchApp();
  const page = await openSettings(app);
  const markRead = switchNamed(page, "Mark as read after copying");
  const trash = switchNamed(page, "Move to Trash after copying");

  await openGmail(page);
  await switchNamed(page, "Find verification codes").click();

  for (const control of [copyMode(page), markRead, trash]) {
    // oxlint-disable-next-line no-await-in-loop -- one row after another
    await expect(control).toBeDisabled();
    // oxlint-disable-next-line no-await-in-loop -- one row after another
    await expect(control).toHaveAccessibleDescription(CODES_OFF);
  }

  await expect
    .poll(() => storedValue(userDataDir, "verificationCodes"))
    .toBe(false);

  await switchNamed(page, "Find verification codes").click();

  await expect(copyMode(page)).toBeEnabled();
  await expect(copyMode(page)).toContainText("As soon as it arrives");
  await expect(markRead).toBeEnabled();
  await expect(markRead).toBeChecked();
  await expect(trash).not.toBeChecked();
  await expect(trash).toHaveAccessibleDescription(
    "Moves the email to the Trash after you copy its code. Meru can occasionally mistake a regular email for one with a code."
  );
  expect(await readStored(userDataDir)).toMatchObject({
    verificationCodes: true,
    verificationCodeCopyMode: "immediately",
    verificationCodeMarkRead: true,
  });
});

test("the keyboard reaches every control in the page's order", async ({
  app,
}) => {
  const page = await openSettings(app);
  const labels = SWITCHES.map(([label]) => label);
  const order = [
    ...labels.slice(0, 9).map((label) => switchNamed(page, label)),
    copyMode(page),
    ...labels.slice(9).map((label) => switchNamed(page, label)),
  ];

  await openGmail(page);

  const first = switchNamed(page, "Hide Gmail logo");

  await first.focus();
  await expect(first).toBeFocused();

  for (const control of order.slice(1)) {
    // oxlint-disable-next-line no-await-in-loop -- one key after another
    await page.keyboard.press("Tab");
    // oxlint-disable-next-line no-await-in-loop -- one key after another
    await expect(control).toBeFocused();
  }
});

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("the page's top and bottom, and codes off, light and dark", async ({
    app,
  }) => {
    const page = await openSettings(app);
    const shoot = async (surface: string) => {
      for (const theme of THEMES) {
        // oxlint-disable-next-line no-await-in-loop -- one theme at a time
        await emulateTheme(app, theme);
        // oxlint-disable-next-line no-await-in-loop -- one after another
        await page.screenshot({ path: shotPath(surface, theme) });
      }
    };

    await openGmail(page);
    await shoot("settings-gmail");

    await switchNamed(
      page,
      "Move to Trash after copying"
    ).scrollIntoViewIfNeeded();
    await shoot("settings-gmail-bottom");

    await switchNamed(page, "Find verification codes").click();
    await expect(copyMode(page)).toBeDisabled();
    await shoot("settings-gmail-codes-off");
  });
});
