import { expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";

import { profiles } from "../app/shared/channels/profiles.ts";
import { invokeIn, launch } from "../scripts/lib/app.ts";
import {
  clickMenuItem,
  entitlementOf,
  inspect,
  profilesOf,
  viewsOf,
} from "./app.ts";
import { startStub } from "./entitlement-stub.ts";

const isLauncher = (page: Page) =>
  new URL(page.url()).pathname.endsWith("/overlay.html");

/** Opens the launcher from the chrome page's button and picks the app named `name` with Enter. */
const openApp = async (
  app: ElectronApplication,
  chrome: Page,
  name: string
) => {
  await chrome.locator("[data-launcher-button]").click();
  await expect.poll(() => app.windows().some(isLauncher)).toBeTruthy();
  const launcher = app.windows().find(isLauncher);
  if (launcher === undefined) {
    throw new Error("The launcher went away");
  }
  const search = launcher.locator("input");
  await search.fill(name);
  await expect(launcher.locator("[data-app-id]")).toHaveCount(1);
  // Enter closes the launcher's page, which can be gone before Playwright hears back about the key, so the press may fail once it has done its work; the poll below is the assertion.
  await search.press("Enter").catch(() => null);
  await expect.poll(() => app.windows().some(isLauncher)).toBeFalsy();
};

const kindOf = async (chrome: Page) => {
  const { kind } = await entitlementOf(chrome);
  return kind;
};

const rowsOf = (chrome: Page) =>
  chrome.locator("nav[data-sidebar] [data-tab-id]");

test("shows a fresh profile with neither the strip nor the profile row", async () => {
  const { chrome, close } = await launch();
  try {
    await expect(chrome.locator("header[data-titlebar]")).toBeVisible();
    await expect(chrome.locator("nav[data-sidebar]")).toHaveCount(0);
    await expect(chrome.locator("[data-profile-row]")).toHaveCount(0);
    await expect(chrome.locator("[data-launcher-button]")).toBeVisible();
  } finally {
    await close();
  }
});

test("shows the strip once Calendar is added through the launcher, and Drive dragged onto it shares its group and the stage", async () => {
  const { app, chrome, close } = await launch();
  try {
    await openApp(app, chrome, "Calendar");
    await expect(rowsOf(chrome)).toHaveCount(2);
    await expect(chrome.locator("nav[data-sidebar] [data-active]")).toHaveCount(
      1
    );
    await expect(chrome.locator("[data-tab-id] [data-active]")).toHaveAttribute(
      "title",
      /Calendar/u
    );

    await openApp(app, chrome, "Drive");
    await expect(rowsOf(chrome)).toHaveCount(3);
    const drive = await rowsOf(chrome).nth(2).boundingBox();
    const calendar = await rowsOf(chrome).nth(1).boundingBox();
    if (drive === null || calendar === null) {
      throw new Error("A row is not drawn");
    }
    await chrome.mouse.move(
      drive.x + drive.width / 2,
      drive.y + drive.height / 2
    );
    await chrome.mouse.down();
    await chrome.mouse.move(
      calendar.x + calendar.width / 2,
      calendar.y + calendar.height / 2,
      { steps: 12 }
    );
    await chrome.mouse.up();

    const group = chrome.locator("nav[data-sidebar] [data-group-id]");
    await expect(group).toHaveCount(1);
    await expect(group.locator("[data-tab-id]")).toHaveCount(2);
    await expect(group).toHaveCSS("border-top-style", "dashed");
    await expect.poll(async () => await viewsOf(chrome)).toHaveLength(2);
  } finally {
    await close();
  }
});

test("shows a row of three profiles under a trial, and CmdOrCtrl+2 selects the second", async () => {
  const stub = await startStub();
  try {
    const { app, chrome, close } = await launch({
      env: { MERU_ENTITLEMENT_URL: stub.url },
    });
    try {
      await expect.poll(async () => await kindOf(chrome)).toBe("trial");
      await invokeIn(chrome, profiles.create, { label: "Work" });
      await invokeIn(chrome, profiles.create, { label: "Club" });
      const buttons = chrome.locator("[data-profile-row] [data-profile-id]");
      await expect(buttons).toHaveText(["Personal", "Work", "Club"]);
      await expect(buttons.nth(0)).toHaveAttribute("data-selected", "true");

      const { menu } = await inspect(chrome);
      expect(menu["profiles.select2"]).toBe("CommandOrControl+2");
      await clickMenuItem(app, "profiles.select2");
      await expect(buttons.nth(1)).toHaveAttribute("data-selected", "true");
      const state = await profilesOf(chrome);
      expect(
        state.profiles.find((found) => found.id === state.selectedProfileId)
          ?.label
      ).toBe("Work");
    } finally {
      await close();
    }
  } finally {
    await stub.stop();
  }
});

test("hides the strip and brings it back with CmdOrCtrl+S, laying the panes out again", async () => {
  const { app, chrome, close } = await launch();
  try {
    await openApp(app, chrome, "Calendar");
    const strip = chrome.locator("nav[data-sidebar]");
    await expect(strip).toBeVisible();
    const { menu } = await inspect(chrome);
    expect(menu["sidebar.toggle"]).toBe("CommandOrControl+S");
    const left = async () => {
      const [first] = await viewsOf(chrome);
      return first?.x;
    };
    const shown = await left();

    await clickMenuItem(app, "sidebar.toggle");
    await expect(strip).toHaveCount(0);
    await expect.poll(left).toBeLessThan(shown ?? 0);

    await clickMenuItem(app, "sidebar.toggle");
    await expect(strip).toBeVisible();
    await expect.poll(left).toBe(shown);
  } finally {
    await close();
  }
});
