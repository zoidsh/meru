import type { Rectangle, Size } from "./window-bounds.ts";

/** Main places the content view below it and the shell draws it this tall. */
export const TITLEBAR_HEIGHT = 40;

/** v3's wide strip, the one width until the settings that choose another. */
export const TAB_STRIP_WIDTH = 224;

/** Where the content view sits in a window's content area. */
export const contentViewBounds = (
  contentSize: Size,
  stripWidth: number
): Rectangle => ({
  x: stripWidth,
  y: TITLEBAR_HEIGHT,
  width: Math.max(0, contentSize.width - stripWidth),
  height: Math.max(0, contentSize.height - TITLEBAR_HEIGHT),
});
