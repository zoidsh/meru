import { chromeColors } from "../app/core/engines/chrome.ts";
import type { Theme } from "../app/core/records/theme.ts";
import { expect, test } from "./app.ts";

test("recolours the chrome page when the theme changes, to dark and back to light", async ({
  launch,
}) => {
  const { app, chrome } = await launch();
  const root = chrome.locator("html");
  const show = async (theme: Theme) => {
    await app.evaluate(({ nativeTheme }, source) => {
      nativeTheme.themeSource = source;
    }, theme);
    await expect(root).toHaveCSS("--chrome", chromeColors(theme).background);
  };
  await show("light");
  await show("dark");
  await show("light");
});
