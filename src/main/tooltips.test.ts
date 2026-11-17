import { describe, expect, it } from "vitest";

import type { OverlayView } from "#platform/overlay-view.ts";

import { createTooltips } from "./tooltips.ts";

const setup = () => {
  const events: string[] = [];
  let gone: (() => void) | undefined;
  const view: OverlayView = {
    webContentsId: 9,
    setBounds: ({ x, y, width, height }) => {
      events.push(`bounds ${x},${y} ${width}x${height}`);
    },
    show: () => events.push("show"),
    hide: () => events.push("hide"),
    focus: () => events.push("focus"),
    onFocus: () => false,
    onGone: (listener) => {
      gone = listener;
    },
    close: () => false,
  };
  const tooltips = createTooltips({
    area: () => ({ width: 800, height: 600 }),
  });

  return { tooltips, view, events, goneNow: () => gone?.() };
};

describe(createTooltips, () => {
  it("shows the view around the tooltip, with room for its arrow, and hides it, never focusing it", () => {
    const { tooltips, view, events } = setup();

    tooltips.adopt(view);
    tooltips.show({ x: 100, y: 44, width: 60, height: 26 });
    tooltips.hide();

    expect(events).toStrictEqual(["bounds 92,36 76x42", "show", "hide"]);
  });

  it("keeps the view inside the window", () => {
    const { tooltips, view, events } = setup();

    tooltips.adopt(view);
    tooltips.show({ x: 2, y: 2, width: 60, height: 26 });
    tooltips.show({ x: 760, y: 580, width: 60, height: 26 });

    expect(events.filter((event) => event.startsWith("bounds"))).toStrictEqual([
      "bounds 0,0 70x36",
      "bounds 752,572 48x28",
    ]);
  });

  it("shows nothing before the shell has made its view, or after it goes", () => {
    const { tooltips, view, events, goneNow } = setup();

    tooltips.show({ x: 100, y: 44, width: 60, height: 26 });
    tooltips.adopt(view);
    goneNow();
    tooltips.show({ x: 100, y: 44, width: 60, height: 26 });

    expect(events).toStrictEqual([]);
  });
});
