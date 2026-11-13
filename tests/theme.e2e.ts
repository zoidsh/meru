import { expect, test } from "@playwright/test";

import { chromeColors } from "../app/core/engines/chrome.ts";
import type { Theme } from "../app/core/records/theme.ts";
import { launch } from "../scripts/lib/app.ts";

test("recolours the chrome page when the theme changes, to dark and back to light", async () => {
  const { app, chrome, close } = await launch();
  try {
    const root = chrome.locator("html");
    const show = async (theme: Theme) => {
      await app.evaluate(({ nativeTheme }, source) => {
        nativeTheme.themeSource = source;
      }, theme);
      await expect(root).toHaveCSS(
        "--background",
        chromeColors(theme).background
      );
    };
    await show("light");
    await show("dark");
    await show("light");
  } finally {
    await close();
  }
});
