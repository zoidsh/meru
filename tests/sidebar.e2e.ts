import type { ElectronApplication, Page } from "@playwright/test";

import { profiles } from "../app/shared/channels/profiles.ts";
import { invokeIn, pageOf, pagesOf } from "../scripts/lib/app.ts";
import {
  clickMenuItem,
  entitlementKindOf,
  expect,
  must,
  pickApp,
  pressIn,
  profilesOf,
  stageOf,
  test,
  viewsOf,
} from "./app.ts";

/** Opens the launcher from the chrome page's button and picks the app named `name` with Enter. */
const openApp = async (
  app: ElectronApplication,
  chrome: Page,
  name: string
) => {
  await chrome.locator("[data-launcher-button]").click();
  await pickApp(app, name);
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
  const source = must(
    await rowsOf(chrome).nth(from).boundingBox(),
    `Row ${from}`
  );
  const target = must(await rowsOf(chrome).nth(to).boundingBox(), `Row ${to}`);
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

test("shows the sidebar once Calendar is added through the launcher, Drive dragged onto it shares its group and the stage, and dragged between rows leaves the group and moves, never above the pinned Gmail", async ({
  launch,
}) => {
  const { app, chrome } = await launch();
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
});

const TAB_DRAG = "kind=tabDrag";

/** Drags the second row over the left fifth of the first pane until the drag's page is up, and answers the pane's rect, the pointer and the drag's page. */
const dragRowOverPane = async (app: ElectronApplication, chrome: Page) => {
  const { panes } = await stageOf(chrome);
  const { rect } = must(panes[0], "The first pane");
  const row = must(await rowsOf(chrome).nth(1).boundingBox(), "The second row");
  await chrome.mouse.move(row.x + row.width / 2, row.y + row.height / 2);
  await chrome.mouse.down();
  const pointer = { x: rect.x + rect.width * 0.1, y: rect.y + rect.height / 2 };
  await chrome.mouse.move(pointer.x, pointer.y, { steps: 12 });
  const overlay = await pageOf(app, TAB_DRAG);
  await overlay.locator("body").waitFor();
  return { overlay, pointer, rect };
};

test("joins a row dragged out of the sidebar beside the pane it is let go on, after the pinned Gmail even by its left edge, marking the half it would take on the way", async ({
  launch,
}) => {
  const { app, chrome } = await launch();
  await openApp(app, chrome, "Calendar");
  await expect(rowsOf(chrome)).toHaveCount(2);
  // Gmail's row is pinned and drags nowhere, so Calendar's is dragged onto Gmail's pane.
  await rowsOf(chrome).nth(0).locator("[role=tab]").click();
  await expect(chrome.locator("[data-tab-id] [data-active]")).toHaveAttribute(
    "title",
    /Gmail/u
  );
  const { overlay, pointer, rect } = await dragRowOverPane(app, chrome);
  // The overlay page hears the pointer only through main, after its page has loaded, so the pointer moves again once it is there.
  await chrome.mouse.move(pointer.x + 1, pointer.y, { steps: 2 });
  const drop = must(
    await overlay.locator("[data-drop]").boundingBox(),
    "The drop mark"
  );
  expect(drop.width).toBeCloseTo(rect.width / 2, 0);
  expect(drop.x).toBeCloseTo(rect.x + rect.width / 2, 0);
  await chrome.mouse.up();

  await expect.poll(() => pagesOf(app, TAB_DRAG)).toHaveLength(0);
  await expect.poll(async () => await viewsOf(app)).toHaveLength(2);
  await expect(
    chrome.locator("nav[data-sidebar] [data-group-id] [data-tab-id]")
  ).toHaveCount(2);
  await expect(chrome.locator("[data-tab-id] [data-active]")).toHaveAttribute(
    "title",
    /Gmail/u
  );
  const { tabs } = await profilesOf(chrome);
  const { panes } = await stageOf(chrome);
  const xOf = (appId: string) => {
    const tab = must(
      tabs.find((found) => found.appId === appId),
      `The ${appId} tab`
    );
    return must(
      panes.find((found) => found.tabId === tab.id),
      `The ${appId} pane`
    ).rect.x;
  };
  expect(xOf("gmail")).toBeLessThan(xOf("calendar"));
});

test("cancels a row's drag over the panes on Escape, which reaches the drag's page, and drops nothing on release", async ({
  launch,
}) => {
  const { app, chrome } = await launch();
  await openApp(app, chrome, "Calendar");
  await expect(rowsOf(chrome)).toHaveCount(2);
  await dragRowOverPane(app, chrome);
  // The stage gives the drag's page the keyboard, so the key goes to it as a keystroke would.
  await pressIn(app, TAB_DRAG, "Escape");
  await expect.poll(() => pagesOf(app, TAB_DRAG)).toHaveLength(0);
  await expect(
    chrome.locator("[data-dnd-dragging], [data-dnd-dropping]")
  ).toHaveCount(0);
  await chrome.mouse.up();
  await expect.poll(async () => await viewsOf(app)).toHaveLength(1);
  await expect(chrome.locator("nav[data-sidebar] [data-group-id]")).toHaveCount(
    0
  );
});

test("shows a row of three profiles under a trial, and the menu's second profile item selects the second", async ({
  launch,
  stub,
}) => {
  const { app, chrome } = await launch({
    env: { MERU_ENTITLEMENT_URL: stub.url },
  });
  await expect.poll(async () => await entitlementKindOf(app)).toBe("trial");
  await invokeIn(chrome, profiles.create, { label: "Work" });
  await invokeIn(chrome, profiles.create, { label: "Club" });
  const buttons = chrome.locator("[data-profile-row] [data-profile-id]");
  await expect(buttons).toHaveText(["Personal", "Work", "Club"]);
  await expect(buttons.nth(0)).toHaveAttribute("data-selected", "true");

  await clickMenuItem(app, "profiles.select2");
  await expect(buttons.nth(1)).toHaveAttribute("data-selected", "true");
  const state = await profilesOf(chrome);
  expect(
    state.profiles.find((found) => found.id === state.selectedProfileId)?.label
  ).toBe("Work");
});

test("hides the sidebar and brings it back from the menu, laying the panes out again", async ({
  launch,
}) => {
  const { app, chrome } = await launch();
  await openApp(app, chrome, "Calendar");
  const sidebar = chrome.locator("nav[data-sidebar]");
  await expect(sidebar).toBeVisible();
  const left = async () => {
    const [first] = await viewsOf(app);
    return must(first, "A pane's view").x;
  };
  const shown = await left();

  await clickMenuItem(app, "sidebar.toggle");
  await expect(sidebar).toHaveCount(0);
  await expect.poll(left).toBeLessThan(shown);

  await clickMenuItem(app, "sidebar.toggle");
  await expect(sidebar).toBeVisible();
  await expect.poll(left).toBe(shown);
});
