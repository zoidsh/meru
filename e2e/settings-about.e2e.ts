// Copy goes to the suite build's clipboard, kept on main's global; nothing
// here writes the system's clipboard. Updates go through the suite build's
// stand-in updater, which reaches no feed and never relaunches the app.
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import {
  NO_TRIAL,
  expect,
  readOpenedExternally,
  stubSystemBrowser,
  test,
} from "./lib/app.ts";
import { openSection, openSettings } from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";

/** The version the packed build carries, read from the manifest it was packed from. */
const buildVersion = async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf-8")
  ) as { version: string };

  return manifest.version;
};

/** This platform's operating system as the page shows it. */
const OPERATING_SYSTEM = {
  darwin: /^macOS \d+(?:\.\d+)* \((?:arm64|x64)\)$/u,
  win32: /^Windows 1[01] \d+ \((?:arm64|x64|ia32)\)$/u,
  linux: /^.+ \((?:arm64|x64)\)$/u,
}[process.platform as "darwin" | "win32" | "linux"];

const copied = (app: ElectronApplication) =>
  app.evaluate(() => Reflect.get(globalThis, "meruTestClipboard") as string[]);

const openAbout = async (app: ElectronApplication) => {
  const page = await openSettings(app);

  await openSection(page, "About");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("About");

  return page;
};

type UpdateEvent =
  | { kind: "checking" }
  | { kind: "available"; version: string }
  | { kind: "notAvailable" }
  | { kind: "downloaded"; version: string }
  | { kind: "error"; signature: boolean };

/** Sends events from the stand-in updater, as the library would. */
const emitUpdate = (app: ElectronApplication, ...events: UpdateEvent[]) =>
  app.evaluate((_electron, sent) => {
    const updater = Reflect.get(globalThis, "meruTestUpdater") as {
      emit: (event: unknown) => void;
    };

    for (const event of sent) {
      updater.emit(event);
    }
  }, events);

/** What the stand-in updater was asked. */
const askedUpdater = (app: ElectronApplication) =>
  app.evaluate(() => {
    const { checks, channels, installs } = Reflect.get(
      globalThis,
      "meruTestUpdater"
    ) as { checks: number; channels: unknown[]; installs: number[] };

    return { checks, channels, installs: installs.length };
  });

const readStored = async (userDataDir: string) =>
  JSON.parse(
    await readFile(path.join(userDataDir, "settings.json"), "utf-8")
  ) as Record<string, unknown>;

/** The Updates group's status row: its live region, holding its one button. */
const statusRow = (page: Page) =>
  page
    .getByRole("main")
    .getByRole("status")
    .filter({ has: page.getByRole("button") });

/** The row's title, description and button as shown. */
const expectStatus = async (
  page: Page,
  {
    title,
    description,
    button,
    enabled = true,
  }: {
    title: string;
    description?: string | RegExp;
    button: string;
    enabled?: boolean;
  }
) => {
  const row = statusRow(page);
  const action = row.getByRole("button", { name: button, exact: true });

  await expect(row.getByText(title, { exact: true })).toBeVisible();
  await expect(action).toBeVisible();
  await expect(action).toHaveAccessibleDescription(description ?? "");
  await (enabled
    ? expect(action).toBeEnabled()
    : expect(action).toBeDisabled());
};

const copyButton = (page: Page, name: string) =>
  page.getByRole("main").getByRole("button", { name, exact: true });

/** Each row's label, the value its Copy describes, and what Copy wrote. */
const expectRows = async (app: ElectronApplication, page: Page) => {
  const main = page.getByRole("main");

  await expect(main.getByText("Version", { exact: true })).toBeVisible();
  await expect(
    main.getByText("Operating system", { exact: true })
  ).toBeVisible();

  const version = copyButton(page, "Copy version");
  const system = copyButton(page, "Copy operating system");

  await expect(version).toHaveAccessibleDescription(await buildVersion());
  await expect(system).toHaveAccessibleDescription(OPERATING_SYSTEM);
  await expect(main.getByRole("button", { name: /^Copy/u })).toHaveCount(2);

  const systemText =
    (await main.getByText(OPERATING_SYSTEM).textContent()) ?? "";

  // The third is the Updates group's status row.
  const statuses = main.getByRole("status");

  await version.click();
  await expect(statuses.nth(0)).toHaveText("Copied");
  await expect(statuses.nth(1)).toHaveText("");
  await system.click();
  await expect(statuses.nth(1)).toHaveText("Copied");
  await expect
    .poll(() => copied(app))
    .toStrictEqual([await buildVersion(), systemText]);
  await expect(statuses.nth(0)).toHaveText("", { timeout: 5000 });
  await expect(statuses.nth(1)).toHaveText("");
};

test("is the nav's last section, after Meru Pro, with no scopes", async ({
  app,
}) => {
  const page = await openAbout(app);
  const nav = page.getByRole("navigation", { name: "Settings sections" });
  const names = await nav.getByRole("button").allTextContents();

  expect(names.slice(-2)).toStrictEqual(["Meru Pro", "About"]);
  await expect(nav.getByRole("button", { name: "About" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(page.getByRole("tablist")).toHaveCount(0);
});

test("shows the version and the operating system, each copied by its button", async ({
  app,
}) => {
  await expectRows(app, await openAbout(app));
});

test("is the same on the free version, with no Meru Pro badge", async ({
  launchApp,
}) => {
  const app = await launchApp(NO_TRIAL);
  const page = await openAbout(app);

  await expect(
    page.getByRole("main").getByRole("button", { name: /^Meru Pro/u })
  ).toHaveCount(0);
  await expectRows(app, page);
});

test.describe("updates", () => {
  test("has the switch, the channel and the launch's check, under the version", async ({
    app,
  }) => {
    const page = await openAbout(app);
    const updates = page.getByRole("group", { name: "Updates" });
    const automatic = updates.getByRole("switch", {
      name: "Check for updates automatically",
    });
    const channel = updates.getByRole("combobox", { name: "Release channel" });

    await expect(automatic).toBeChecked();
    await expect(automatic).toHaveAccessibleDescription(
      "Meru downloads updates in the background and installs them when you quit."
    );
    await expect(channel).toContainText("Stable");
    await expect(channel).toHaveAccessibleDescription(
      "Beta gets new features sooner, but it may have more bugs."
    );
    // The launch's check, which the stand-in leaves running.
    await expectStatus(page, {
      title: "Checking for updates…",
      button: "Check now",
      enabled: false,
    });
    expect(await askedUpdater(app)).toStrictEqual({
      checks: 1,
      channels: [
        { channel: "latest", allowPrerelease: false, allowDowngrade: true },
      ],
      installs: 0,
    });

    await channel.click();
    await expect(page.getByRole("option")).toHaveText(["Stable", "Beta"]);
    await page.keyboard.press("Escape");
  });

  test("says where updating stands, each with its button", async ({ app }) => {
    const page = await openAbout(app);

    await emitUpdate(app, { kind: "error", signature: false });
    await expectStatus(page, {
      title: "Couldn't check for updates",
      description: "Try again later.",
      button: "Check now",
    });

    await statusRow(page).getByRole("button", { name: "Check now" }).click();
    await expect.poll(() => askedUpdater(app)).toMatchObject({ checks: 2 });
    await expectStatus(page, {
      title: "Checking for updates…",
      button: "Check now",
      enabled: false,
    });

    await emitUpdate(app, { kind: "notAvailable" });
    await expectStatus(page, {
      title: "Meru is up to date",
      description: /^Last checked .+\d.*\.$/u,
      button: "Check now",
    });

    await emitUpdate(app, { kind: "available", version: "4.2.0" });
    await expectStatus(page, {
      title: "Downloading Meru 4.2.0…",
      button: "Check now",
      enabled: false,
    });

    await emitUpdate(app, { kind: "error", signature: true });
    await expectStatus(page, {
      title: "Meru 4.2.0 couldn't be verified, so it wasn't installed.",
      button: "Download",
    });
    await stubSystemBrowser(app);
    await statusRow(page).getByRole("button", { name: "Download" }).click();
    await expect
      .poll(() => readOpenedExternally(app))
      .toStrictEqual(["https://github.com/zoidsh/meru/releases/tag/v4.2.0"]);

    await emitUpdate(
      app,
      { kind: "available", version: "4.2.1" },
      { kind: "downloaded", version: "4.2.1" }
    );
    await expectStatus(page, {
      title: "Meru 4.2.1 is ready to install",
      description: "Meru installs it when you quit.",
      button: "Restart now",
    });
    // A later check of the same version leaves it ready.
    await emitUpdate(
      app,
      { kind: "checking" },
      { kind: "available", version: "4.2.1" }
    );
    await expectStatus(page, {
      title: "Meru 4.2.1 is ready to install",
      description: "Meru installs it when you quit.",
      button: "Restart now",
    });
  });

  test("writes the switch and the channel to settings.json, a new channel checking at once", async ({
    app,
    userDataDir,
  }) => {
    const page = await openAbout(app);
    const updates = page.getByRole("group", { name: "Updates" });

    await emitUpdate(app, { kind: "notAvailable" });
    await updates
      .getByRole("switch", { name: "Check for updates automatically" })
      .click();
    await expect
      .poll(() => readStored(userDataDir))
      .toMatchObject({ autoUpdate: false });

    await updates.getByRole("combobox", { name: "Release channel" }).click();
    await page.getByRole("option", { name: "Beta" }).click();
    await expect
      .poll(() => readStored(userDataDir))
      .toMatchObject({ updateChannel: "beta" });
    await expect
      .poll(() => askedUpdater(app))
      .toStrictEqual({
        checks: 2,
        channels: [
          { channel: "latest", allowPrerelease: false, allowDowngrade: true },
          { channel: "beta", allowPrerelease: true, allowDowngrade: false },
        ],
        installs: 0,
      });
  });

  test("Restart now installs only once the quit has saved what it saves", async ({
    launchApp,
    userDataDir,
  }) => {
    const app = await launchApp();
    const page = await openAbout(app);
    const log: string[] = [];

    app.process().stderr?.on("data", (chunk: Buffer) => {
      log.push(chunk.toString());
    });
    await emitUpdate(
      app,
      { kind: "available", version: "4.2.0" },
      { kind: "downloaded", version: "4.2.0" }
    );

    const closed = app.waitForEvent("close");

    // The changes are sent in the same turn as the click, so their writes are
    // still out as the quit begins; each is written after those ahead of it.
    await statusRow(page)
      .getByRole("button", { name: "Restart now" })
      .evaluate((button: HTMLElement) => {
        const { calls } = Reflect.get(window, "meru") as {
          calls: {
            update: (change: { key: string; value: unknown }) => Promise<void>;
          };
        };

        for (const key of ["unreadBadge", "hidePromoBanner", "autoUpdate"]) {
          void calls.update({ key, value: false });
        }

        button.click();
      });
    await closed;

    expect(log.join("")).toContain("meruTestUpdater: quit and install");
    expect(await readStored(userDataDir)).toMatchObject({
      unreadBadge: false,
      hidePromoBanner: false,
      autoUpdate: false,
    });
  });

  test("is one line on a build that cannot update itself, which never checks", async ({
    launchApp,
  }) => {
    const app = await launchApp({ MERU_TEST_UPDATER: "unsupported" });
    const page = await openAbout(app);
    const main = page.getByRole("main");

    await expect(
      main.getByText("This build doesn't update itself.", { exact: true })
    ).toBeVisible();
    await expect(main.getByRole("group", { name: "Updates" })).toHaveCount(0);
    await expect(main.getByRole("switch")).toHaveCount(0);
    await expect(main.getByRole("combobox")).toHaveCount(0);
    expect(await askedUpdater(app)).toStrictEqual({
      checks: 0,
      channels: [],
      installs: 0,
    });
  });
});

/** The page in each theme, as `name`. */
const shoot = async (page: Page, app: ElectronApplication, name: string) => {
  for (const theme of THEMES) {
    // oxlint-disable-next-line no-await-in-loop -- one theme at a time
    await emulateTheme(app, theme);
    // oxlint-disable-next-line no-await-in-loop -- one after another
    await page.screenshot({ path: shotPath(name, theme) });
  }
};

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("the page, up to date, light and dark", async ({ app }) => {
    const page = await openAbout(app);

    await emitUpdate(app, { kind: "notAvailable" });
    await expect(page.getByText("Meru is up to date")).toBeVisible();
    await shoot(page, app, "settings-about");
  });

  test("an update ready, light and dark", async ({ app }) => {
    const page = await openAbout(app);

    await emitUpdate(
      app,
      { kind: "available", version: "4.2.0" },
      { kind: "downloaded", version: "4.2.0" }
    );
    await expect(
      page.getByText("Meru 4.2.0 is ready to install")
    ).toBeVisible();
    await shoot(page, app, "settings-about-ready");
  });

  test("an update not verified, light and dark", async ({ app }) => {
    const page = await openAbout(app);

    await emitUpdate(
      app,
      { kind: "available", version: "4.2.0" },
      { kind: "error", signature: true }
    );
    await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
    await shoot(page, app, "settings-about-unverified");
  });
});
