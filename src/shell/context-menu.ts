import type { KeyboardEvent } from "react";

/** Shift+F10 or the Menu key, which open a focused control's menu beside it. */
export const isMenuKey = (event: KeyboardEvent) =>
  event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);

/** A point of the window in whole CSS pixels, as main takes a menu's. */
export const wholePoint = (x: number, y: number) => ({
  x: Math.max(0, Math.round(x)),
  y: Math.max(0, Math.round(y)),
});
