import type { ElectronApplication } from "@playwright/test";

import { SHELL_GREY } from "#core/shell-grey.ts";

import { expect, findPage, test, writeSettings } from "./lib/app.ts";
import { openSettings } from "./lib/settings.ts";

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
