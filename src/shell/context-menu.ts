import type { KeyboardEvent } from "react";

/** Shift+F10 or the Menu key, which open a focused control's menu beside it. */
export const isMenuKey = (event: KeyboardEvent) =>
  event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);

/**
 * A `contextmenu` the keyboard made, which carries no button. Chromium on
 * Windows sends one on the key's release even when its press was handled,
 * so a control that opens its menu on the press drops it.
 */
export const isKeyMadeMenu = (event: Pick<MouseEvent, "button">) =>
  event.button === -1;

/** A point of the window in whole CSS pixels, as main takes a menu's. */
export const wholePoint = (x: number, y: number) => ({
  x: Math.max(0, Math.round(x)),
  y: Math.max(0, Math.round(y)),
});
