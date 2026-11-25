// Each state of the entitlement is reached through its stored file and the
// stand-in server the suite's build holds in place of the entitlement API:
// nothing here reaches the network, the clipboard or a browser.
import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import { DAY, MERU_PRO_URL } from "#core/entitlement.ts";

import {
  expect,
  readOpenedExternally,
  stubSystemBrowser,
  test,
} from "./lib/app.ts";
import { SETTINGS_URL, openSection, openSettings } from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";

const KEY = "MERU-TEST-AAAA-BBBB-CCCC-7Q2K";
const MASKED = "MERU-••••-••••-••••-••••-7Q2K";

/** Seeds `entitlement.json`; the store's version is 1. */
const writeEntitlement = (userDataDir: string, file: object) =>
  writeFile(
    path.join(userDataDir, "entitlement.json"),
    JSON.stringify({ version: 1, ...file })
  );

/** Seeds what the stand-in server remembers of this install. */
const writeStub = (userDataDir: string, record: object) =>
  writeFile(
    path.join(userDataDir, "entitlement-stub.json"),
    JSON.stringify({ licenses: {}, ...record })
  );

const openPro = async (app: ElectronApplication) => {
  const page = await openSettings(app);

  await openSection(page, "Meru Pro");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Meru Pro");

  return page;
};

const main = (page: Page) => page.getByRole("main");

/** The status row's line and sentence. */
const expectStatus = async (page: Page, title: string, description: string) => {
  await expect(main(page).getByText(title, { exact: true })).toBeVisible();
  await expect(
    main(page).getByText(description, { exact: true })
  ).toBeVisible();
};

const enterKey = (page: Page) =>
  page.getByRole("button", { name: "Enter license key…" });

const changeKey = (page: Page) =>
  page.getByRole("button", { name: "Change license key" });

const keyDialog = (page: Page, name: string) =>
  page.getByRole("dialog", { name });

const keyField = (page: Page) =>
  page.getByRole("textbox", { name: "License key" });

const activate = (page: Page) => page.getByRole("button", { name: "Activate" });

const deviceName = (page: Page) =>
  page.getByRole("textbox", { name: "Device name" });

const saveName = (page: Page) =>
  page.getByRole("button", { name: "Save device name" });

const copied = (app: ElectronApplication) =>
  app.evaluate(() => Reflect.get(globalThis, "meruTestClipboard") as string[]);

const holdServer = (app: ElectronApplication, hold: boolean) =>
  app.evaluate((_electron, on) => {
    const server = Reflect.get(globalThis, "meruTestEntitlementServer") as {
      hold: () => void;
      release: () => void;
    };

    if (on) {
      server.hold();
    } else {
      server.release();
    }
  }, hold);

const closeSettings = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }, url) => {
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().startsWith(url))
      ?.close();
  }, SETTINGS_URL);

/** Activates `key` through the page's dialog. */
const activateInDialog = async (page: Page, key: string) => {
  await enterKey(page).click();
  await keyField(page).fill(key);
  await activate(page).click();
};

test("is the last section, and shows a running trial's days with Upgrade, which opens Meru Pro's page", async ({
  app,
}) => {
  await stubSystemBrowser(app);

  const page = await openSettings(app);
  const nav = page.getByRole("navigation", { name: "Settings sections" });

  await expect(nav.getByRole("button").last()).toHaveAccessibleName("Meru Pro");
  await openSection(page, "Meru Pro");
  await expectStatus(
    page,
    "Meru Pro trial",
    "Your trial ends in 14 days. Upgrade to keep every feature."
  );

  const license = page.getByRole("group", { name: "License" });

  await expect(enterKey(page)).toHaveAccessibleDescription(
    "Already bought Meru Pro? Enter your key to unlock it."
  );
  await expect(license.getByRole("button")).toHaveCount(1);
  await expect(deviceName(page)).toHaveCount(0);

  const upgrade = page.getByRole("button", { name: "Upgrade" });

  await expect(upgrade).toHaveAccessibleDescription(
    "Your trial ends in 14 days. Upgrade to keep every feature."
  );
  await upgrade.click();
  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual([MERU_PRO_URL]);
});

test("enters a key in the dialog, says why one is refused in main's words, and once one activates shows it masked with Copy and Change…", async ({
  app,
}) => {
  const page = await openPro(app);

  await enterKey(page).click();

  const dialog = keyDialog(page, "Enter license key");

  await expect(dialog).toBeVisible();
  await expect(keyField(page)).toBeFocused();
  await expect(activate(page)).toBeDisabled();

  for (const [key, message] of [
    ["not a key", "This isn't a valid license key. Check it and try again."],
    [
      "MERU-USED-0000-0000-0000",
      "This key is already in use on as many devices as it allows.",
    ],
    [
      "MERU-0000-0000-0000-0000",
      "There's no license with this key. Check it and try again, or contact support.",
    ],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one key after another
    await keyField(page).fill(key);
    // oxlint-disable-next-line no-await-in-loop -- one key after another
    await keyField(page).press("Enter");
    // oxlint-disable-next-line no-await-in-loop -- one key after another
    await expect(dialog.getByRole("alert")).toHaveText(message);
    // oxlint-disable-next-line no-await-in-loop -- one key after another
    await expect(keyField(page)).toHaveAttribute("aria-invalid", "true");
    // oxlint-disable-next-line no-await-in-loop -- one key after another
    await expect(keyField(page)).toHaveAccessibleDescription(
      `You'll find it in the email you got when you bought Meru Pro. ${message}`
    );
  }

  await keyField(page).fill(KEY);
  await activate(page).click();
  await expect(dialog).toHaveCount(0);
  await expect(changeKey(page)).toBeFocused();
  await expectStatus(
    page,
    "Meru Pro",
    "You have every feature, and you can use Meru for work. Thanks for your support."
  );
  await expect(main(page).getByText("Licensed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upgrade" })).toHaveCount(0);
  await expect(main(page).getByText(MASKED, { exact: true })).toBeVisible();
  await expect(main(page)).not.toContainText(KEY);

  await page.getByRole("button", { name: "Copy license key" }).click();
  await expect.poll(() => copied(app)).toStrictEqual([KEY]);
  await expect(page.getByRole("status")).toHaveText("Copied");

  await changeKey(page).click();
  await expect(keyDialog(page, "Change license key")).toBeVisible();
  await expect(keyField(page)).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(changeKey(page)).toBeFocused();
});

test("names the device only once licensed, sends a name when saved, and gives the generated one back for an empty name", async ({
  app,
}) => {
  const page = await openPro(app);

  await activateInDialog(page, KEY);
  await expect(deviceName(page)).toHaveValue(/^Device [\dA-F]{4}$/u);

  const generated = await deviceName(page).inputValue();

  await expect(deviceName(page)).toHaveAccessibleDescription(
    "This is how this computer shows up on your license."
  );
  await expect(saveName(page)).toBeDisabled();

  await deviceName(page).fill("Studio");
  await deviceName(page).press("Enter");
  await expect(saveName(page)).toBeDisabled();
  await expect(deviceName(page)).toHaveValue("Studio");
  await expect
    .poll(() =>
      app.evaluate(
        () =>
          (
            Reflect.get(globalThis, "meruTestEntitlement") as {
              snapshot: () => { deviceName: string | null };
            }
          ).snapshot().deviceName
      )
    )
    .toBe("Studio");

  await deviceName(page).fill("");
  await expect(saveName(page)).toBeEnabled();
  await saveName(page).click();
  await expect(deviceName(page)).toHaveValue(generated);
});

test("while an activation is out the dialog stays open and nothing else sends, even from a Settings window opened again", async ({
  app,
}) => {
  const page = await openPro(app);

  await holdServer(app, true);
  await activateInDialog(page, KEY);

  const dialog = keyDialog(page, "Enter license key");

  await expect(activate(page)).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await expect(keyField(page)).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();

  await closeSettings(app);
  await expect.poll(() => page.isClosed()).toBe(true);

  const again = await openPro(app);

  await expect(enterKey(again)).toBeDisabled();

  await holdServer(app, false);
  await expect(changeKey(again)).toBeEnabled();
  await expect(main(again).getByText(MASKED, { exact: true })).toBeVisible();
});

test("a key carried over and not yet confirmed shows as Pro with its key, and with no answer for 14 days asks to go online and try again", async ({
  launchApp,
  userDataDir,
}) => {
  await writeEntitlement(userDataDir, {
    licenseKey: KEY,
    keyStoredAt: Date.now() - 15 * DAY,
  });

  const app = await launchApp({ MERU_STUB_OFFLINE: "1" });
  const page = await openPro(app);

  await expectStatus(
    page,
    "Meru couldn't confirm your license",
    "You're using the free version until it's confirmed. Go online and try again."
  );
  await expect(main(page).getByText(MASKED, { exact: true })).toBeVisible();
  await expect(changeKey(page)).toBeEnabled();
  await expect(deviceName(page)).toHaveCount(0);

  const retry = page.getByRole("button", { name: "Try again" });

  await retry.click();
  await expect(retry).toBeEnabled();
  await expectStatus(
    page,
    "Meru couldn't confirm your license",
    "You're using the free version until it's confirmed. Go online and try again."
  );
});

test("a clock set well before the key was stored says the date looks wrong", async ({
  launchApp,
  userDataDir,
}) => {
  await writeEntitlement(userDataDir, {
    licenseKey: KEY,
    keyStoredAt: Date.now() + 2 * DAY,
  });

  const app = await launchApp({ MERU_STUB_OFFLINE: "1" });
  const page = await openPro(app);

  await expectStatus(
    page,
    "Your computer's date looks wrong",
    "Meru can't confirm Meru Pro until it's right. Set the correct date and time, then try again."
  );
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("a license the server no longer takes ends Pro at the next launch, then reads as the free version", async ({
  launchApp,
  userDataDir,
}) => {
  await writeEntitlement(userDataDir, {
    licenseKey: KEY,
    keyStoredAt: Date.now(),
  });

  const first = await launchApp();
  const page = await openPro(first);

  await expectStatus(
    page,
    "Your license can't be used",
    "Pro features turn off when you quit Meru. Contact support if you think this is a mistake."
  );
  await expect(page.getByRole("button", { name: "Upgrade" })).toBeVisible();
  await first.close();

  const second = await launchApp();

  await expectStatus(
    await openPro(second),
    "Your license can't be used",
    "You're using the free version. Contact support if you think this is a mistake."
  );
});

test("a trial that ends while Meru runs ends Pro at the next launch, then reads as the free version", async ({
  launchApp,
  userDataDir,
}) => {
  const first = await launchApp();

  await expectStatus(
    await openPro(first),
    "Meru Pro trial",
    "Your trial ends in 14 days. Upgrade to keep every feature."
  );
  await first.close();
  await writeStub(userDataDir, { trialStartedAt: Date.now() - 15 * DAY });

  const second = await launchApp();

  await expectStatus(
    await openPro(second),
    "Your trial has ended",
    "Pro features turn off when you quit Meru. Upgrade to keep them."
  );
  await second.close();

  const third = await launchApp();

  await expectStatus(
    await openPro(third),
    "Your trial has ended",
    "You're using the free version. Upgrade to get every feature back."
  );
});

test("with no trial or key and no answer, reads as the free version; a key carried over reads as Pro while it is checked", async ({
  launchApp,
  userDataDir,
}) => {
  const free = await launchApp({ MERU_STUB_OFFLINE: "1" });

  await expectStatus(
    await openPro(free),
    "Meru Pro",
    "You're using the free version. Upgrade to get every feature."
  );
  await free.close();

  await writeEntitlement(userDataDir, {
    licenseKey: KEY,
    keyStoredAt: Date.now(),
  });

  const carried = await launchApp({ MERU_STUB_OFFLINE: "1" });
  const page = await openPro(carried);

  await expectStatus(page, "Meru Pro", "Meru is checking your license.");
  await expect(page.getByRole("button", { name: "Upgrade" })).toHaveCount(0);
  await expect(main(page).getByText(MASKED, { exact: true })).toBeVisible();
});

const shoot = async (app: ElectronApplication, page: Page, surface: string) => {
  for (const theme of THEMES) {
    // oxlint-disable-next-line no-await-in-loop -- one theme at a time
    await emulateTheme(app, theme);
    // oxlint-disable-next-line no-await-in-loop -- one after another
    await page.screenshot({ path: shotPath(surface, theme) });
  }
};

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("each status, and the dialog with an error, light and dark", async ({
    launchApp,
    userDataDir,
  }) => {
    const trial = await launchApp();
    const page = await openPro(trial);

    await shoot(trial, page, "settings-pro-trial");
    await enterKey(page).click();
    await keyField(page).fill("MERU-USED-0000-0000-0000");
    await activate(page).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await shoot(trial, page, "settings-pro-dialog-error");
    await keyField(page).fill(KEY);
    await activate(page).click();
    await expect(changeKey(page)).toBeFocused();
    await shoot(trial, page, "settings-pro-licensed");
    await trial.close();

    const seeded: [string, object, Record<string, string>][] = [
      ["none", {}, { MERU_STUB_OFFLINE: "1" }],
      [
        "provisional",
        { licenseKey: KEY, keyStoredAt: Date.now() },
        { MERU_STUB_OFFLINE: "1" },
      ],
      [
        "unconfirmed-offline",
        { licenseKey: KEY, keyStoredAt: Date.now() - 15 * DAY },
        { MERU_STUB_OFFLINE: "1" },
      ],
      [
        "unconfirmed-clock",
        { licenseKey: KEY, keyStoredAt: Date.now() + 2 * DAY },
        { MERU_STUB_OFFLINE: "1" },
      ],
      [
        "refused",
        {
          licenseKey: "MERU-GONE-0000-0000-0000-0000",
          keyStoredAt: Date.now(),
        },
        {},
      ],
    ];

    for (const [surface, file, env] of seeded) {
      // oxlint-disable-next-line no-await-in-loop -- one launch at a time
      await writeEntitlement(userDataDir, file);
      // oxlint-disable-next-line no-await-in-loop -- one launch at a time
      await writeStub(userDataDir, {});

      // oxlint-disable-next-line no-await-in-loop -- one launch at a time
      const app = await launchApp(env);
      // oxlint-disable-next-line no-await-in-loop -- one launch at a time
      const shown = await openPro(app);

      if (surface === "refused") {
        // oxlint-disable-next-line no-await-in-loop -- once the refresh lands
        await expect(
          main(shown).getByText("Your license can't be used")
        ).toBeVisible();
      }

      // oxlint-disable-next-line no-await-in-loop -- one launch at a time
      await shoot(app, shown, `settings-pro-${surface}`);
      // oxlint-disable-next-line no-await-in-loop -- one launch at a time
      await app.close();
    }

    await writeEntitlement(userDataDir, {});
    await writeStub(userDataDir, { trialStartedAt: Date.now() - 15 * DAY });

    const ended = await launchApp();
    const endedPage = await openPro(ended);

    await expect(
      main(endedPage).getByText("Your trial has ended")
    ).toBeVisible();
    await shoot(ended, endedPage, "settings-pro-trial-ended");
  });
});
