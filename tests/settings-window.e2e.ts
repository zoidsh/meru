import { expect, test } from "@playwright/test";

import { settings } from "../app/shared/channels/settings.ts";
import { invokeIn, launch, runCommand } from "../scripts/lib/app.ts";
import { clickMenuItem, settingsPageOf } from "./app.ts";

test("opens one settings window from its command, whose pages write the settings every page follows", async () => {
  const { app, chrome, close } = await launch();
  try {
    await runCommand(chrome, "settings.open");
    const page = await settingsPageOf(app);
    await expect(page.locator("h1")).toHaveText("Profiles");
    await expect(page.locator("[data-profile-id]")).toHaveCount(1);

    await clickMenuItem(app, "settings.open");
    await expect
      .poll(
        () =>
          app
            .windows()
            .filter((found) => found.url().includes("/settings.html")).length
      )
      .toBe(1);

    await page.getByRole("button", { name: "Updates" }).click();
    await expect(page.locator("h1")).toHaveText("Updates");
    await page.getByText("Beta", { exact: true }).click();
    await expect
      .poll(async () => {
        const answered = await invokeIn(chrome, settings.snapshot, {});
        return answered.ok
          ? answered.value.layers.global["updater.channel"]
          : null;
      })
      .toBe("beta");

    await page.getByRole("button", { name: "Shortcuts" }).click();
    await expect(page.locator("[data-command='settings.open']")).toContainText(
      process.platform === "darwin" ? "⌘," : "Ctrl+,"
    );
  } finally {
    await close();
  }
});
