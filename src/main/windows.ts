import { debounce } from "es-toolkit";

import { resolveWindowBounds } from "#core/window-bounds.ts";
import type { Rectangle, Size } from "#core/window-bounds.ts";
import type { BaseWindowOptions, PlainWindow } from "#platform/base-window.ts";
import type { Displays } from "#platform/displays.ts";

/** What the main window and a tab's own window share in how they open. */
export interface OpeningOptions {
  displays: Displays;
  /** Where it last was, if it was ever moved or resized. */
  saved: Rectangle | undefined;
  defaultSize: Size;
  minimumSize: Size;
  title: string;
  isMacOS: boolean;
  backgroundColor: string;
}

/**
 * Where a window opens and how: where it last was while that is on a screen,
 * else the default size on the primary one; on macOS with its title bar
 * hidden under the page-drawn one.
 */
export const openingOptions = ({
  displays,
  saved,
  defaultSize,
  minimumSize,
  title,
  isMacOS,
  backgroundColor,
}: OpeningOptions): BaseWindowOptions => ({
  title,
  bounds: resolveWindowBounds({
    saved,
    displays: displays.getAll(),
    defaultSize,
    minimumSize,
  }),
  minimumSize,
  titleBarStyle: isMacOS ? "hiddenInset" : "default",
  backgroundColor,
});

/**
 * Brings the window back, hidden or minimized: for a second launch, the Dock,
 * the tray, a notification's click or a tab in its own window clicked. In the
 * background it is only shown, never focused, so Meru never takes the
 * foreground.
 */
export const revealWindow = (
  window: Pick<
    PlainWindow,
    | "isDestroyed"
    | "isMinimized"
    | "restore"
    | "show"
    | "showInactive"
    | "focus"
  >,
  background: boolean
) => {
  if (window.isDestroyed()) {
    return;
  }

  if (window.isMinimized()) {
    window.restore();
  }

  if (background) {
    window.showInactive();
  } else {
    window.show();
    window.focus();
  }
};

/** How long a move or resize rests before where the window is gets saved. */
const KEEP_BOUNDS_MS = 500;

/**
 * Saves where the window is once a move or resize has rested; `flush` saves
 * one still waiting at once, as a close or a quit must.
 */
export const keepBounds = (
  window: Pick<PlainWindow, "onBoundsChange" | "getBounds" | "isDestroyed">,
  save: (bounds: Rectangle) => void
) => {
  const saving = debounce(() => {
    if (!window.isDestroyed()) {
      save(window.getBounds());
    }
  }, KEEP_BOUNDS_MS);

  window.onBoundsChange(saving);

  return saving;
};
