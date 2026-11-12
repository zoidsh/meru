import { expect, test } from "@playwright/test";

import type { Rect } from "../packages/app/core/records/rect.ts";
import { MENU_IDS } from "../packages/app/main/shell/menu.ts";
import { clickMenuItem, launch, stageOf, styleOf, viewsOf } from "./app.ts";

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

test("splits, drags the divider across the panes, and closes a pane", async () => {
  const { app, chrome, close } = await launch();
  try {
    await expect.poll(async () => await viewsOf(chrome)).toHaveLength(1);

    await clickMenuItem(app, MENU_IDS.splitVertically);
    await expect.poll(async () => await viewsOf(chrome)).toHaveLength(2);
    const split = await stageOf(chrome);
    const [left, right] = split.views;
    expect(left && right && overlap(left, right)).toBe(0);
    expect(split.views).toStrictEqual(
      split.stage.panes.map((pane) => pane.rect)
    );

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
    await chrome.mouse.up();

    await expect
      .poll(async () => {
        const { stage } = await stageOf(chrome);
        const [moved] = stage.dividers;
        return moved === undefined ? 0 : moved.rect.x + moved.rect.width / 2;
      })
      .toBeCloseTo(x - 200, 0);
    const dragged = await stageOf(chrome);
    expect(dragged.views[0]?.width).toBeLessThan(left?.width ?? 0);
    expect(dragged.views).toHaveLength(2);

    await clickMenuItem(app, MENU_IDS.closePane);
    await expect.poll(async () => await viewsOf(chrome)).toHaveLength(1);
  } finally {
    await close();
  }
});

test("draws classic panes edge to edge", async () => {
  const { chrome, close } = await launch({
    settings: { global: { "appearance.style": "classic" } },
  });
  try {
    await expect.poll(async () => await styleOf(chrome)).toBe("classic");
    const [view] = await viewsOf(chrome);
    const size = await chrome.evaluate<{ width: number; height: number }>(
      "({ width: innerWidth, height: innerHeight })"
    );
    expect(view).toStrictEqual({ ...size, x: 0, y: 0 });
  } finally {
    await close();
  }
});
