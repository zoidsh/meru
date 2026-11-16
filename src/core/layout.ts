import type { Rectangle, Size } from "./window-bounds.ts";

/** Main places the content view below it and the shell draws it this tall. */
export const TITLEBAR_HEIGHT = 40;

/** Where the content view sits in a window's content area. */
export const contentViewBounds = (contentSize: Size): Rectangle => ({
  x: 0,
  y: TITLEBAR_HEIGHT,
  width: Math.max(0, contentSize.width),
  height: Math.max(0, contentSize.height - TITLEBAR_HEIGHT),
});
