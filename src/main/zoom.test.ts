import { describe, expect, it } from "vitest";

import type { ZoomChange } from "#platform/zoom.ts";

import { createZoom } from "./zoom.ts";

const OVERLAY = 3;
const TITLEBAR = 7;
const PAGE = 11;
const SHELL = 1;

/** Zooms with the web contents `focused` holding focus, or none. */
const zoomWith = (focused: number | undefined) => {
  const zoomed: string[] = [];
  const zoom = createZoom({
    zoomFocused: (change, accepts) => {
      if (focused === undefined || !accepts(focused)) {
        return false;
      }

      zoomed.push(`${focused} ${change}`);

      return true;
    },
    isShellDocument: (id) => id === OVERLAY || id === TITLEBAR,
    zoomPage: (change: ZoomChange) => zoomed.push(`page ${change}`),
  });

  zoom("in");

  return zoomed;
};

describe(createZoom, () => {
  it("zooms the web contents with focus, a page or the shell", () => {
    expect([zoomWith(PAGE), zoomWith(SHELL)]).toStrictEqual([
      [`${PAGE} in`],
      [`${SHELL} in`],
    ]);
  });

  it("zooms the page instead of the overlay or a window's titlebar, and with nothing focused", () => {
    expect([
      zoomWith(OVERLAY),
      zoomWith(TITLEBAR),
      zoomWith(undefined),
    ]).toStrictEqual([["page in"], ["page in"], ["page in"]]);
  });
});
