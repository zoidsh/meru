import type { ElectronApplication, Page } from "@playwright/test";

import { SHELL_GREY } from "#core/shell-grey.ts";

import {
  SHELL_URL,
  clickMenuItem,
  expect,
  findOverlayDocument,
  findPage,
  readState,
  test,
  writeSettings,
} from "./lib/app.ts";
import { openSettings, seedProfiles } from "./lib/settings.ts";

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

/**
 * The theme Meru gave Electron and each window's own colour. Playwright
 * emulates the light scheme in every page, so the pages' own media query
 * says nothing here.
 */
const readTheme = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow, nativeTheme }) => ({
    source: nativeTheme.themeSource,
    dark: nativeTheme.shouldUseDarkColors,
    windows: BrowserWindow.getAllWindows()
      .map((window) => window.getBackgroundColor().toLowerCase())
      .toSorted(),
  }));

/**
 * The titlebar's background as drawn, red, green and blue: a computed
 * `color-mix` stays in its mixing space, so a canvas converts it.
 */
const titlebarRgb = (shell: Page) =>
  shell.getByRole("banner", { name: "Title bar" }).evaluate((element) => {
    const context = document.createElement("canvas").getContext("2d");

    if (!context) {
      throw new Error("No 2D canvas");
    }

    context.fillStyle = getComputedStyle(element).backgroundColor;
    context.fillRect(0, 0, 1, 1);

    const [red = 0, green = 0, blue = 0] = context.getImageData(
      0,
      0,
      1,
      1
    ).data;

    return [red, green, blue];
  });

test("Tint with profile color off leaves the title bar the plain shell grey, and on gives it the profile's blue again", async ({
  app,
}) => {
  const shell = await findPage(app, SHELL_URL);
  const leansBlue = async () => {
    const [red = 0, , blue = 0] = await titlebarRgb(shell);

    return blue > red;
  };

  await expect.poll(leansBlue).toBeTruthy();

  await setSetting(app, "profileTint", false);
  // The light shell grey, `#ebebeb`, under Playwright's light scheme.
  await expect.poll(() => titlebarRgb(shell)).toStrictEqual([235, 235, 235]);

  await setSetting(app, "profileTint", true);
  await expect.poll(leansBlue).toBeTruthy();
});

test("each title bar button switch hides and returns its button, its command still working", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work"]);

  const app = await launchApp();
  const shell = await findPage(app, SHELL_URL);
  const overlay = await findOverlayDocument(app);
  const titlebar = shell.getByRole("banner", { name: "Title bar" });

  // New tab shows only while the sidebar is hidden, as it is for one tab.
  await expect(shell.getByRole("tablist", { name: "Tabs" })).toHaveCount(0);

  for (const [key, name, command] of [
    ["titlebarNewTab", "New tab", "app.open"],
    ["titlebarUnifiedInbox", "Unified inbox", "inbox.toggle"],
    ["titlebarDownloads", "Downloads", "downloads.toggle"],
  ] as const) {
    const button = titlebar.getByRole("button", { name, exact: true });

    // oxlint-disable-next-line no-await-in-loop -- one button after another
    await expect(button).toBeVisible();
    // oxlint-disable-next-line no-await-in-loop -- one button after another
    await setSetting(app, key, false);
    // oxlint-disable-next-line no-await-in-loop -- one button after another
    await expect(button).toHaveCount(0);

    // oxlint-disable-next-line no-await-in-loop -- one button after another
    await clickMenuItem(app, command);
    // oxlint-disable-next-line no-await-in-loop -- one button after another
    await expect(overlay.getByRole("dialog")).toBeVisible();
    // oxlint-disable-next-line no-await-in-loop -- one button after another
    await clickMenuItem(app, command);
    // oxlint-disable-next-line no-await-in-loop -- one button after another
    await expect(overlay.getByRole("dialog")).toHaveCount(0);

    // oxlint-disable-next-line no-await-in-loop -- one button after another
    await setSetting(app, key, true);
    // oxlint-disable-next-line no-await-in-loop -- one button after another
    await expect(button).toBeVisible();
  }
});

test("the Do Not Disturb switch hides the moon only while Do Not Disturb is off, and never changes Do Not Disturb", async ({
  app,
  userDataDir,
}) => {
  const shell = await findPage(app, SHELL_URL);
  const settings = await openSettings(app);
  const row = settings.getByRole("switch", { name: "Do Not Disturb" });
  const moon = shell
    .getByRole("banner", { name: "Title bar" })
    .getByRole("button", { name: /^Do Not Disturb/u });
  const stored = async () => {
    const { doNotDisturb } = await readState<{ doNotDisturb?: unknown }>(
      userDataDir
    );

    return doNotDisturb;
  };

  await expect(moon).toBeVisible();
  await setSetting(app, "titlebarDoNotDisturb", false);
  await expect(moon).toHaveCount(0);
  expect(await stored()).toBeUndefined();

  await row.click();
  await expect(moon).toBeVisible();
  await expect.poll(stored).toStrictEqual({ until: null });

  await setSetting(app, "titlebarDoNotDisturb", true);
  await setSetting(app, "titlebarDoNotDisturb", false);
  await expect(moon).toBeVisible();
  expect(await stored()).toStrictEqual({ until: null });

  await row.click();
  await expect(moon).toHaveCount(0);
  await expect.poll(stored).toBeUndefined();
});

test.describe("Theme", () => {
  test("a stored theme is Meru's before its window is made", async ({
    launchApp,
    userDataDir,
  }) => {
    await writeSettings(userDataDir, { theme: "dark" });

    const app = await launchApp();

    await findPage(app, "meru-app:");

    expect(await readTheme(app)).toStrictEqual({
      source: "dark",
      dark: true,
      windows: [SHELL_GREY.dark],
    });
  });

  test("a change applies at once to the main window and Settings, and System follows the system again", async ({
    app,
  }) => {
    await openSettings(app);

    await setSetting(app, "theme", "dark");
    await expect
      .poll(() => readTheme(app))
      .toStrictEqual({
        source: "dark",
        dark: true,
        windows: [SHELL_GREY.dark, SHELL_GREY.dark],
      });

    await setSetting(app, "theme", "light");
    await expect
      .poll(() => readTheme(app))
      .toStrictEqual({
        source: "light",
        dark: false,
        windows: [SHELL_GREY.light, SHELL_GREY.light],
      });

    await setSetting(app, "theme", "system");
    await expect
      .poll(async () => {
        const { source } = await readTheme(app);

        return source;
      })
      .toBe("system");
  });
});
