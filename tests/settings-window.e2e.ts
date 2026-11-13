import { expect, test } from "@playwright/test";

import { profiles } from "../app/shared/channels/profiles.ts";
import { settings } from "../app/shared/channels/settings.ts";
import { invokeIn, launch, runCommand } from "../scripts/lib/app.ts";
import {
  clickMenuItem,
  launcherOpen,
  pressInSettings,
  profilesOf,
  settingsPageOf,
} from "./app.ts";

const COMMAND = process.platform === "darwin" ? "meta" : "control";

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

test("records Cmd/Ctrl+T on the shortcuts page rather than opening the launcher", async () => {
  const { app, chrome, close } = await launch();
  try {
    await runCommand(chrome, "settings.open");
    const page = await settingsPageOf(app);
    await page.getByRole("button", { name: "Shortcuts" }).click();
    await page
      .locator("[data-command='launcher.open'] [aria-label^='Shortcut for']")
      .click();
    await expect(page.locator("[data-recording]")).toHaveCount(1);
    await pressInSettings(app, "T", [COMMAND]);
    await expect
      .poll(async () => {
        const answered = await invokeIn(chrome, settings.snapshot, {});
        return answered.ok
          ? answered.value.layers.global["shortcuts.bindings"]
          : null;
      })
      .toStrictEqual({ "launcher.open": "CommandOrControl+T" });
    expect(launcherOpen(app)).toBeFalsy();
  } finally {
    await close();
  }
});

test("edits a profile on the profiles page into the state every page follows, and follows an edit made elsewhere", async () => {
  const { app, chrome, close } = await launch();
  try {
    await runCommand(chrome, "settings.open");
    const page = await settingsPageOf(app);
    const first = async () => {
      const { profiles: shown } = await profilesOf(chrome);
      return shown[0];
    };
    const label = page.getByRole("textbox", { name: "Label" });
    await label.fill("Home");
    await label.blur();
    await expect
      .poll(async () => {
        const profile = await first();
        return profile?.label;
      })
      .toBe("Home");

    await page.locator("label:has(input[value='#30a46c'])").click();
    await expect
      .poll(async () => {
        const profile = await first();
        return profile?.color;
      })
      .toBe("#30a46c");

    const profile = await first();
    await invokeIn(chrome, profiles.update, {
      label: "Office",
      profileId: profile?.id ?? "",
    });
    await expect(label).toHaveValue("Office");
  } finally {
    await close();
  }
});

test("locks a Pro setting at its default without Pro, and main refuses a write to it", async () => {
  const { app, chrome, close } = await launch();
  try {
    await runCommand(chrome, "settings.open");
    const page = await settingsPageOf(app);
    await page.getByRole("button", { name: "Panes" }).click();
    const field = page.locator("[data-setting='links.openInApp']");
    await expect(field.locator("[data-locked]")).toBeVisible();
    await expect(field.getByRole("switch")).toBeDisabled();
    await expect(field.getByRole("switch")).toBeChecked();

    const written = await invokeIn(chrome, settings.set, {
      key: "links.openInApp",
      value: false,
    });
    const answered = await invokeIn(chrome, settings.snapshot, {});
    expect({
      locked: answered.ok
        ? answered.value.locked["links.openInApp"] !== undefined
        : null,
      stored: answered.ok
        ? answered.value.layers.global["links.openInApp"]
        : null,
      written: written.ok,
    }).toStrictEqual({ locked: true, stored: undefined, written: false });
  } finally {
    await close();
  }
});
