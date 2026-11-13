import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import type { Rect } from "../app/core/records/rect.ts";
import type { CommandId } from "../app/shared/commands/registry.ts";
import { launch } from "../scripts/lib/app.ts";
import { clickMenuItem, stageOf, viewsOf } from "./app.ts";

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

test("splits, drags the divider across the panes, moves focus, and closes a tab", async () => {
  const { app, chrome, close } = await launch();
  try {
    await expect.poll(async () => await viewsOf(app)).toHaveLength(1);

    await clickMenuItem(app, SPLIT_VERTICAL);
    await expect.poll(async () => await viewsOf(app)).toHaveLength(2);
    const split = await viewsOf(app);
    const [left, right] = split;
    expect(left && right && overlap(left, right)).toBe(0);
    const { panes } = await stageOf(chrome);
    expect(split).toStrictEqual(panes.map((pane) => pane.rect));

    const divider = chrome.locator(".divider");
    await expect(divider).toHaveCount(1);
    const box = await divider.boundingBox();
    if (box === null) {
      throw new Error("The divider is not drawn");
    }
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await chrome.mouse.move(x, y);
    await chrome.mouse.down();
    await chrome.mouse.move(x - 200, y, { steps: 10 });
    // The divider the chrome page draws follows the pointer before the release.
    await expect
      .poll(async () => {
        const moving = await divider.boundingBox();
        return moving === null ? 0 : moving.x + moving.width / 2;
      })
      .toBeCloseTo(x - 200, 0);
    await chrome.mouse.up();

    await expect
      .poll(async () => {
        const { dividers } = await stageOf(chrome);
        const [moved] = dividers;
        return moved === undefined ? 0 : moved.rect.x + moved.rect.width / 2;
      })
      .toBeCloseTo(x - 200, 0);
    const dragged = await viewsOf(app);
    expect(dragged[0]?.width).toBeLessThan(left?.width ?? 0);
    expect(dragged).toHaveLength(2);

    const shown = await stageOf(chrome);
    const [first, second] = shown.panes.map((pane) => pane.paneId);
    expect(shown.focusedPaneId).toBe(second);
    await clickMenuItem(app, FOCUS_NEXT);
    await expect.poll(async () => await focusedOf(chrome)).toBe(first);
    await clickMenuItem(app, FOCUS_PREVIOUS);
    await expect.poll(async () => await focusedOf(chrome)).toBe(second);

    await clickMenuItem(app, CLOSE_TAB);
    await expect.poll(async () => await viewsOf(app)).toHaveLength(1);
  } finally {
    await close();
  }
});
