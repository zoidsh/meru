import { expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";

import { profiles } from "../app/shared/channels/profiles.ts";
import { invokeIn, launch } from "../scripts/lib/app.ts";
import {
  clickMenuItem,
  entitlementOf,
  pickApp,
  profilesOf,
  stageOf,
  viewsOf,
} from "./app.ts";
import { startStub } from "./entitlement-stub.ts";

/** Opens the launcher from the chrome page's button and picks the app named `name` with Enter. */
const openApp = async (
  app: ElectronApplication,
  chrome: Page,
  name: string
) => {
  await chrome.locator("[data-launcher-button]").click();
  await pickApp(app, name);
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

test("shows the sidebar once Calendar is added through the launcher, Drive dragged onto it shares its group and the stage, and dragged between rows leaves the group and moves, never above the pinned Gmail", async () => {
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
    await expect.poll(async () => await viewsOf(app)).toHaveLength(2);

    await drag(chrome, 2, 0, "before");
    await expect(group).toHaveCount(0);
    await expect
      .poll(async () => await appsOf(chrome))
      .toStrictEqual(["Gmail", "Drive", "Calendar"]);

    await drag(chrome, 2, 0, "before");
    await expect
      .poll(async () => await appsOf(chrome))
      .toStrictEqual(["Gmail", "Calendar", "Drive"]);
  } finally {
    await close();
  }
});

const isTabDrag = (page: Page) =>
  new URL(page.url()).searchParams.get("kind") === "tabDrag";

test("joins a row dragged out of the sidebar beside the pane it is let go on, marking the half it would take on the way", async () => {
  const { app, chrome, close } = await launch();
  try {
    await openApp(app, chrome, "Calendar");
    await expect(rowsOf(chrome)).toHaveCount(2);
    // Gmail's row is pinned and drags nowhere, so Calendar's is dragged onto Gmail's pane.
    await rowsOf(chrome).nth(0).locator("[role=tab]").click();
    await expect(chrome.locator("[data-tab-id] [data-active]")).toHaveAttribute(
      "title",
      /Gmail/u
    );
    const { panes } = await stageOf(chrome);
    const [pane] = panes;
    const source = await rowsOf(chrome).nth(1).boundingBox();
    if (pane === undefined || source === null) {
      throw new Error("Neither a pane nor a row is drawn");
    }
    await chrome.mouse.move(
      source.x + source.width / 2,
      source.y + source.height / 2
    );
    await chrome.mouse.down();
    const left = {
      x: pane.rect.x + pane.rect.width * 0.1,
      y: pane.rect.y + pane.rect.height / 2,
    };
    await chrome.mouse.move(left.x, left.y, { steps: 12 });
    await expect.poll(() => app.windows().some(isTabDrag)).toBeTruthy();
    const overlay = app.windows().find(isTabDrag);
    // The overlay page hears the pointer only through main, after its page has loaded, so the pointer moves again once it is there.
    await overlay?.locator("body").waitFor();
    await chrome.mouse.move(left.x + 1, left.y, { steps: 2 });
    const drop = await overlay?.locator("[data-drop]").boundingBox();
    expect(drop?.width).toBeCloseTo(pane.rect.width / 2, 0);
    await chrome.mouse.up();

    await expect.poll(() => app.windows().some(isTabDrag)).toBeFalsy();
    await expect.poll(async () => await viewsOf(app)).toHaveLength(2);
    await expect(
      chrome.locator("nav[data-sidebar] [data-group-id] [data-tab-id]")
    ).toHaveCount(2);
    await expect(chrome.locator("[data-tab-id] [data-active]")).toHaveAttribute(
      "title",
      /Gmail/u
    );
    const { tabs } = await profilesOf(chrome);
    const xOf = async (appId: string) => {
      const tab = tabs.find((found) => found.appId === appId);
      const shown = await stageOf(chrome);
      return shown.panes.find((found) => found.tabId === tab?.id)?.rect.x;
    };
    expect((await xOf("calendar")) ?? Infinity).toBeLessThan(
      (await xOf("gmail")) ?? -Infinity
    );
  } finally {
    await close();
  }
});

test("cancels a row's drag over the panes on Escape, which reaches the drag's page, and drops nothing on release", async () => {
  const { app, chrome, close } = await launch();
  try {
    await openApp(app, chrome, "Calendar");
    await expect(rowsOf(chrome)).toHaveCount(2);
    const { panes } = await stageOf(chrome);
    const [pane] = panes;
    const source = await rowsOf(chrome).nth(1).boundingBox();
    if (pane === undefined || source === null) {
      throw new Error("Neither a pane nor a row is drawn");
    }
    await chrome.mouse.move(
      source.x + source.width / 2,
      source.y + source.height / 2
    );
    await chrome.mouse.down();
    await chrome.mouse.move(
      pane.rect.x + pane.rect.width * 0.1,
      pane.rect.y + pane.rect.height / 2,
      { steps: 12 }
    );
    await expect.poll(() => app.windows().some(isTabDrag)).toBeTruthy();
    await app.windows().find(isTabDrag)?.locator("body").waitFor();
    // The stage gives the drag's page the keyboard, so the key goes to it as a keystroke would.
    await app.evaluate(({ webContents }) => {
      const page = webContents
        .getAllWebContents()
        .find((found) => found.getURL().includes("kind=tabDrag"));
      page?.sendInputEvent({ keyCode: "Escape", type: "keyDown" });
      page?.sendInputEvent({ keyCode: "Escape", type: "keyUp" });
    });
    await expect.poll(() => app.windows().some(isTabDrag)).toBeFalsy();
    await expect(
      chrome.locator("[data-dnd-dragging], [data-dnd-dropping]")
    ).toHaveCount(0);
    await chrome.mouse.up();
    await expect.poll(async () => await viewsOf(app)).toHaveLength(1);
    await expect(
      chrome.locator("nav[data-sidebar] [data-group-id]")
    ).toHaveCount(0);
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
      const [first] = await viewsOf(app);
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
