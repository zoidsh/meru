import { expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";

import { profiles } from "../app/shared/channels/profiles.ts";
import { invokeIn, launch } from "../scripts/lib/app.ts";
import { clickMenuItem, entitlementOf, profilesOf, viewsOf } from "./app.ts";
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

// A row's title ends with its app's name.
const appsOf = async (chrome: Page) => {
  const tabs = await rowsOf(chrome).locator("[role=tab]").all();
  return await Promise.all(
    tabs.map(async (tab) => {
      const title = await tab.getAttribute("title");
      return title?.split(" – ").at(-1);
    })
  );
};

// The sidebar marks the zone under the pointer on its next frame, so the release waits for the mark of the zone it means.
/** Drags row `from` over row `to`, `onto` its middle or `before` its top quarter, and lets go there. */
const drag = async (
  chrome: Page,
  from: number,
  to: number,
  zone: "before" | "onto"
) => {
  const source = await rowsOf(chrome).nth(from).boundingBox();
  const target = await rowsOf(chrome).nth(to).boundingBox();
  if (source === null || target === null) {
    throw new Error("A row is not drawn");
  }
  await chrome.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2
  );
  await chrome.mouse.down();
  await chrome.mouse.move(
    target.x + target.width / 2,
    target.y + target.height * (zone === "before" ? 0.1 : 0.5),
    { steps: 12 }
  );
  await expect(rowsOf(chrome).nth(to)).toHaveAttribute("data-drop", zone);
  await chrome.mouse.up();
  // dnd-kit animates the row back into place and takes no other drag until it has.
  await expect(
    chrome.locator("[data-dnd-dragging], [data-dnd-dropping]")
  ).toHaveCount(0);
};

test("shows the sidebar once Calendar is added through the launcher, Drive dragged onto it shares its group and the stage, and dragged between rows leaves the group and moves", async () => {
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
    await drag(chrome, 2, 1, "onto");

    const group = chrome.locator("nav[data-sidebar] [data-group-id]");
    await expect(group).toHaveCount(1);
    await expect(group.locator("[data-tab-id]")).toHaveCount(2);
    await expect(group).toHaveCSS("border-top-style", "dashed");
    await expect.poll(async () => await viewsOf(chrome)).toHaveLength(2);

    await drag(chrome, 2, 0, "before");
    await expect(group).toHaveCount(0);
    await expect
      .poll(async () => await appsOf(chrome))
      .toStrictEqual(["Drive", "Gmail", "Calendar"]);

    await drag(chrome, 2, 0, "before");
    await expect
      .poll(async () => await appsOf(chrome))
      .toStrictEqual(["Calendar", "Drive", "Gmail"]);
  } finally {
    await close();
  }
});

test("shows a row of three profiles under a trial, and the menu's second profile item selects the second", async () => {
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

test("hides the sidebar and brings it back from the menu, laying the panes out again", async () => {
  const { app, chrome, close } = await launch();
  try {
    await openApp(app, chrome, "Calendar");
    const sidebar = chrome.locator("nav[data-sidebar]");
    await expect(sidebar).toBeVisible();
    const left = async () => {
      const [first] = await viewsOf(chrome);
      return first?.x;
    };
    const shown = await left();

    await clickMenuItem(app, "sidebar.toggle");
    await expect(sidebar).toHaveCount(0);
    await expect.poll(left).toBeLessThan(shown ?? 0);

    await clickMenuItem(app, "sidebar.toggle");
    await expect(sidebar).toBeVisible();
    await expect.poll(left).toBe(shown);
  } finally {
    await close();
  }
});
