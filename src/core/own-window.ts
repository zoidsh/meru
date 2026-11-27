import { TITLEBAR_HEIGHT } from "./layout.ts";
import type { TabKey } from "./tabs.ts";
import type { Rectangle, Size } from "./window-bounds.ts";

/**
 * The start of the name the shell's `window.open` gives a tab's own
 * window's titlebar document, followed by the tab's key as JSON.
 */
export const OWN_WINDOW_FRAME_PREFIX = "meru-window:";

/**
 * The start of the name of a tab's own window's find bar document, which
 * main shows over the page while the bar is open.
 */
export const OWN_WINDOW_FIND_FRAME_PREFIX = "meru-window-find:";

/**
 * The start of the name of the document a tab's own window shows its card
 * in, Downloads or another, over the page while one is open there.
 */
export const OWN_WINDOW_CARD_FRAME_PREFIX = "meru-window-card:";

const frameName = (prefix: string, { profileId, tabId }: TabKey) =>
  `${prefix}${JSON.stringify([profileId, tabId])}`;

export const ownWindowFrameName = (key: TabKey) =>
  frameName(OWN_WINDOW_FRAME_PREFIX, key);

export const ownWindowFindFrameName = (key: TabKey) =>
  frameName(OWN_WINDOW_FIND_FRAME_PREFIX, key);

export const ownWindowCardFrameName = (key: TabKey) =>
  frameName(OWN_WINDOW_CARD_FRAME_PREFIX, key);

const keyOfFrame = (prefix: string, name: string): TabKey | undefined => {
  if (!name.startsWith(prefix)) {
    return;
  }

  try {
    const parsed: unknown = JSON.parse(name.slice(prefix.length));

    return Array.isArray(parsed) &&
      parsed.length === 2 &&
      parsed.every((part) => typeof part === "string" && part !== "")
      ? { profileId: parsed[0] as string, tabId: parsed[1] as string }
      : undefined;
  } catch {
    return undefined;
  }
};

/** The tab whose own window's titlebar a frame name is, if it is one. */
export const ownWindowOfFrame = (name: string) =>
  keyOfFrame(OWN_WINDOW_FRAME_PREFIX, name);

/** The tab whose own window's find bar a frame name is, if it is one. */
export const ownWindowFindOfFrame = (name: string) =>
  keyOfFrame(OWN_WINDOW_FIND_FRAME_PREFIX, name);

/** The tab whose own window's card document a frame name is, if it is one. */
export const ownWindowCardOfFrame = (name: string) =>
  keyOfFrame(OWN_WINDOW_CARD_FRAME_PREFIX, name);

/**
 * Whether the shell may open a document under `name`: one of a tab's own
 * window, its titlebar, find bar or card, only while that window is open,
 * since a shell that lags behind main can ask for one after the window has
 * closed. Any other name is not this rule's to refuse.
 */
export const ownWindowDocumentWanted = (
  name: string,
  isOpen: (key: TabKey) => boolean
) => {
  const key =
    ownWindowOfFrame(name) ??
    ownWindowFindOfFrame(name) ??
    ownWindowCardOfFrame(name);

  return key === undefined || isOpen(key);
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
