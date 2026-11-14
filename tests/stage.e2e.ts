import type { Page } from "@playwright/test";

import type { Rect } from "../app/core/records/rect.ts";
import { tabs } from "../app/shared/channels/profiles.ts";
import type { CommandId } from "../app/shared/commands/registry.ts";
import { invokeIn } from "../scripts/lib/app.ts";
import {
  clickMenuItem,
  expect,
  inspect,
  launcherOf,
  must,
  panesOf,
  pickApp,
  stageOf,
  test,
  viewsOf,
} from "./app.ts";

const SPLIT_VERTICAL: CommandId = "stage.splitVertical";
const CLOSE_TAB: CommandId = "stage.closeTab";
const FOCUS_NEXT: CommandId = "stage.focusNext";
const FOCUS_PREVIOUS: CommandId = "stage.focusPrevious";

const focusedOf = async (chrome: Page) => {
  const { focusedPaneId } = await stageOf(chrome);
  return focusedPaneId;
};

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

test("splits with the app picked in the launcher, drags the divider across the panes, moves focus, and closes a tab", async ({
  launch,
}) => {
  const { app, chrome } = await launch();
  await expect.poll(async () => await viewsOf(app)).toHaveLength(1);

  const { menu } = await inspect(app);
  expect(menu[SPLIT_VERTICAL]).toBe("CommandOrControl+Alt+N");
  await clickMenuItem(app, SPLIT_VERTICAL);
  const launcher = await launcherOf(app);
  await expect(launcher.locator("input")).toHaveAttribute(
    "placeholder",
    "Split vertically with…"
  );
  expect(await panesOf(app)).toHaveLength(1);
  await pickApp(app, "Calendar");
  // The views and the snapshot are two reads, and a window still settling after launch can lay out again between them, so they are read together until they agree.
  let split: Rect[] = [];
  await expect(async () => {
    const [views, { panes }] = await Promise.all([
      viewsOf(app),
      stageOf(chrome),
    ]);
    expect(views).toHaveLength(2);
    expect(views).toStrictEqual(panes.map((pane) => pane.rect));
    split = views;
  }).toPass({ timeout: 5000 });
  const [left, right] = split;
  expect(
    overlap(must(left, "The left pane"), must(right, "The right pane"))
  ).toBe(0);

  const divider = chrome.locator(".divider");
  await expect(divider).toHaveCount(1);
  const box = must(await divider.boundingBox(), "The divider");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await chrome.mouse.move(x, y);
  await chrome.mouse.down();
  await chrome.mouse.move(x - 200, y, { steps: 10 });
  // The divider the chrome page draws follows the pointer before the release.
  await expect
    .poll(async () => {
      const moving = must(await divider.boundingBox(), "The divider");
      return moving.x + moving.width / 2;
    })
    .toBeCloseTo(x - 200, 0);
  await chrome.mouse.up();

  await expect
    .poll(async () => {
      const { dividers } = await stageOf(chrome);
      const { rect } = must(dividers[0], "The divider");
      return rect.x + rect.width / 2;
    })
    .toBeCloseTo(x - 200, 0);
  await expect.poll(async () => await viewsOf(app)).toHaveLength(2);
  const dragged = await viewsOf(app);
  expect(must(dragged[0], "The left pane").width).toBeLessThan(
    must(left, "The left pane").width
  );

  const shown = await stageOf(chrome);
  const [first, second] = shown.panes.map((pane) => pane.paneId);
  expect(shown.focusedPaneId).toBe(second);
  await clickMenuItem(app, FOCUS_NEXT);
  await expect.poll(async () => await focusedOf(chrome)).toBe(first);
  await clickMenuItem(app, FOCUS_PREVIOUS);
  await expect.poll(async () => await focusedOf(chrome)).toBe(second);

  await clickMenuItem(app, CLOSE_TAB);
  await expect.poll(async () => await viewsOf(app)).toHaveLength(1);
});

test("keeps a tab's page through a split beside it, leaving the group and joining it again", async ({
  launch,
}) => {
  const { app, chrome } = await launch();
  await expect.poll(async () => await panesOf(app)).toHaveLength(1);
  const [shown] = await panesOf(app);
  const first = must(shown, "The first tab's pane");

  await clickMenuItem(app, SPLIT_VERTICAL);
  await pickApp(app, "Calendar");
  await expect.poll(async () => await panesOf(app)).toHaveLength(2);
  const [kept, second] = await panesOf(app);
  const added = must(second, "The added tab's pane");
  expect(kept).toStrictEqual(first);
  expect(added.contentsId).not.toBe(first.contentsId);

  // Gmail's tab is pinned to its group, so Calendar's leaves; the window keeps showing the group it left, so it is brought back to the front to read its pane.
  const addedId = added.tabId;
  await invokeIn(chrome, tabs.leave, { tabId: addedId, to: 1 });
  await expect.poll(async () => await panesOf(app)).toStrictEqual([first]);
  await invokeIn(chrome, tabs.focus, { tabId: addedId });
  await expect.poll(async () => await panesOf(app)).toStrictEqual([added]);

  await invokeIn(chrome, tabs.join, {
    orientation: "vertical",
    side: "before",
    tabId: addedId,
    targetTabId: first.tabId,
  });
  await invokeIn(chrome, tabs.focus, { tabId: addedId });
  await expect
    .poll(async () => await panesOf(app))
    .toStrictEqual([added, first]);
});

test("sends a window a pane opens onto another site to the browser rather than opening a window", async ({
  launch,
}) => {
  const { app } = await launch();
  await expect.poll(async () => await panesOf(app)).toHaveLength(1);
  const [shown] = await panesOf(app);
  const pane = must(shown, "The pane");
  await app.evaluate(async ({ webContents }, contentsId) => {
    await webContents
      .fromId(contentsId)
      ?.executeJavaScript(
        'window.open("https://example.com/"); window.open("about:blank").location = "https://example.org/"; 1',
        true
      );
  }, pane.contentsId);
  await expect
    .poll(async () => {
      const { external } = await inspect(app);
      return external;
    })
    .toStrictEqual(["https://example.com/", "https://example.org/"]);
  expect(
    await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length
    )
  ).toBe(1);
});
