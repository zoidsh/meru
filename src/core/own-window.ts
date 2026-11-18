import { TITLEBAR_HEIGHT } from "./layout.ts";
import type { TabKey } from "./tabs.ts";
import type { Rectangle, Size } from "./window-bounds.ts";

/**
 * The start of the name the shell's `window.open` gives a tab's own
 * window's titlebar document, followed by the tab's key as JSON.
 */
export const OWN_WINDOW_FRAME_PREFIX = "meru-window:";

export const ownWindowFrameName = ({ profileId, tabId }: TabKey) =>
  `${OWN_WINDOW_FRAME_PREFIX}${JSON.stringify([profileId, tabId])}`;

/** The tab whose own window's titlebar a frame name is, if it is one. */
export const ownWindowOfFrame = (frameName: string): TabKey | undefined => {
  if (!frameName.startsWith(OWN_WINDOW_FRAME_PREFIX)) {
    return;
  }

  try {
    const parsed: unknown = JSON.parse(
      frameName.slice(OWN_WINDOW_FRAME_PREFIX.length)
    );

    return Array.isArray(parsed) &&
      parsed.length === 2 &&
      parsed.every((part) => typeof part === "string" && part !== "")
      ? { profileId: parsed[0] as string, tabId: parsed[1] as string }
      : undefined;
  } catch {
    return undefined;
  }
};

/** How far the page sits in from a tab's own window's sides and bottom. */
export const OWN_WINDOW_INSET = 8;

export const OWN_WINDOW_RADIUS = 8;

/** Where the page sits in a tab's own window: below the titlebar, inset. */
export const ownWindowPageBounds = ({ width, height }: Size): Rectangle => ({
  x: OWN_WINDOW_INSET,
  y: TITLEBAR_HEIGHT,
  width: Math.max(0, width - 2 * OWN_WINDOW_INSET),
  height: Math.max(0, height - TITLEBAR_HEIGHT - OWN_WINDOW_INSET),
});
