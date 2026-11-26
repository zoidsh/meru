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
  ["Hide promotions", "hidePromoBanner"],
  ["Hide Upgrade button", "hideUpgradeButton"],
  ["Hide inbox footer", "hideInboxFooter"],
  ["Extend Gmail's dark theme", "extendDarkTheme"],
  ["Newest message first", "reverseConversation"],
  ["Show attachments first", "moveAttachmentsToTop"],
  ["Show trimmed content", "showTrimmedContent"],
  ["Close compose window after sending", "closeComposeWindowAfterSend"],
  ["Find verification codes", "verificationCodes"],
  ["Show during Do Not Disturb", "verificationCodesDuringDoNotDisturb"],
] as const;

const CODES_OFF = "Turn on Find verification codes first.";

const copyMode = (page: Page) =>
  page.getByRole("combobox", { name: "Copy code" });

const afterCopy = (page: Page) =>
  page.getByRole("combobox", { name: "After copying" });

const openGmail = async (page: Page) => {
  await openSection(page, "Gmail");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Gmail");
};

test("opens from the sidebar, and Back returns to the page before", async ({
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

  await sections.getByRole("button", { name: "Gmail" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Gmail");
});

test("each card is a group its heading names, holding its rows", async ({
  app,
}) => {
  const page = await openSettings(app);

  await openGmail(page);

  for (const [group, label] of [
    ["Gmail appearance", "Hide promotions"],
    ["Conversations", "Show trimmed content"],
    ["Verification codes", "Show during Do Not Disturb"],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one group after another
    await expect(
      page
        .getByRole("group", { name: group })
        .getByRole("switch", { name: label })
    ).toBeVisible();
  }

  await expect(
    page.getByRole("group", { name: "Gmail appearance" })
  ).toHaveAccessibleDescription(
    "These change how Gmail looks in Meru. Your Gmail settings stay the same."
  );
});

test("each switch shows the stored value and writes the one it is turned to", async ({
  launchApp,
  userDataDir,
}) => {
  await writeSettings(userDataDir, {
    hidePromoBanner: true,
    reverseConversation: true,
  });

  const app = await launchApp();
  const page = await openSettings(app);
  const stored = {
    hidePromoBanner: true,
    hideUpgradeButton: false,
    hideInboxFooter: false,
    extendDarkTheme: false,
    reverseConversation: true,
    moveAttachmentsToTop: false,
    showTrimmedContent: false,
    closeComposeWindowAfterSend: false,
    verificationCodes: true,
    verificationCodesDuringDoNotDisturb: true,
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

test("on a fresh profile the four Gmail appearance switches are off, and a hide switched on hides Gmail's promotions while the page stays loaded, and off shows them again", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);
  const promo = view.getByText(GMAIL_PARTS.promo);

  await expect(promo).toBeVisible();
  await view.evaluate(() => {
    Reflect.set(window, "keptAcrossSettings", true);
  });

  const page = await openSettings(app);

  await openGmail(page);

  for (const [label] of SWITCHES.slice(0, 4)) {
    // oxlint-disable-next-line no-await-in-loop -- one row after another
    await expect(switchNamed(page, label)).not.toBeChecked();
  }

  await switchNamed(page, "Hide promotions").click();
  await expect(promo).toBeHidden();
  await switchNamed(page, "Hide promotions").click();
  await expect(promo).toBeVisible();
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

test("After copying reads a file's earlier Move to Trash switch, and writes its own choice alone, the earlier switch left as found", async ({
  launchApp,
  userDataDir,
}) => {
  await writeSettings(userDataDir, {
    verificationCodeMarkRead: true,
    verificationCodeTrash: true,
  });

  const app = await launchApp();
  const page = await openSettings(app);

  await openGmail(page);
  await expect(afterCopy(page)).toContainText("Move to Trash");
  await expect(afterCopy(page)).toHaveAccessibleDescription(
    "Meru can occasionally mistake a regular email for one with a code."
  );
  await afterCopy(page).click();
  await expect(page.getByRole("option")).toHaveText([
    "Do nothing",
    "Mark as read",
    "Move to Trash",
  ]);
  await page.getByRole("option", { name: "Do nothing" }).click();

  await expect(afterCopy(page)).toContainText("Do nothing");
  await expect
    .poll(() => storedValue(userDataDir, "verificationCodeAfterCopy"))
    .toBe("nothing");
  expect(await readStored(userDataDir)).toMatchObject({
    verificationCodeMarkRead: true,
    verificationCodeTrash: true,
  });
});

test("After copying is Do nothing on a fresh profile", async ({ app }) => {
  const page = await openSettings(app);

  await openGmail(page);
  await expect(afterCopy(page)).toContainText("Do nothing");
});

test("with codes off the three rows under it are disabled and say why, and come back with their values", async ({
  launchApp,
  userDataDir,
}) => {
  await writeSettings(userDataDir, {
    verificationCodesDuringDoNotDisturb: false,
    verificationCodeCopyMode: "immediately",
    verificationCodeAfterCopy: "markRead",
  });

  const app = await launchApp();
  const page = await openSettings(app);
  const duringDoNotDisturb = switchNamed(page, "Show during Do Not Disturb");

  await openGmail(page);
  await switchNamed(page, "Find verification codes").click();

  for (const control of [duringDoNotDisturb, copyMode(page), afterCopy(page)]) {
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
  await expect(duringDoNotDisturb).toBeEnabled();
  await expect(duringDoNotDisturb).not.toBeChecked();
  await expect(duringDoNotDisturb).toHaveAccessibleDescription(
    "Shows codes even when Do Not Disturb or quiet hours are on."
  );
  await expect(afterCopy(page)).toBeEnabled();
  await expect(afterCopy(page)).toContainText("Mark as read");
  expect(await readStored(userDataDir)).toMatchObject({
    verificationCodes: true,
    verificationCodesDuringDoNotDisturb: false,
    verificationCodeCopyMode: "immediately",
    verificationCodeAfterCopy: "markRead",
  });
});

test("the keyboard reaches every control in the page's order", async ({
  app,
}) => {
  const page = await openSettings(app);
  const order = [
    ...SWITCHES.map(([label]) => switchNamed(page, label)),
    copyMode(page),
    afterCopy(page),
  ];

  await openGmail(page);

  const first = switchNamed(page, "Hide promotions");

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

    await afterCopy(page).scrollIntoViewIfNeeded();
    await shoot("settings-gmail-bottom");

    await switchNamed(page, "Find verification codes").click();
    await expect(copyMode(page)).toBeDisabled();
    await shoot("settings-gmail-codes-off");
  });
});
