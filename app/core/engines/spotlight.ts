import type { Layout } from "../records/layout.ts";
import { err, ok } from "../result.ts";
import type { Result } from "../result.ts";
import { paneOfTab, panes } from "./layout.ts";

/** Which of its group's panes a stage gives more than its share, by tab: a maximised one the whole stage, a fullscreen one the whole window. Kept per window and never stored, since it is a way of looking at the group, not part of it. */
export interface Spotlight {
  readonly maximised: string | undefined;
  readonly fullscreen: string | undefined;
}

export const NO_SPOTLIGHT: Spotlight = {
  fullscreen: undefined,
  maximised: undefined,
};

/** Focusing another pane than the maximised one shows every pane again; the same spotlight when nothing changes. */
export const afterFocus = (spotlight: Spotlight, tabId: string): Spotlight =>
  spotlight.maximised === undefined || spotlight.maximised === tabId
    ? spotlight
    : { ...spotlight, maximised: undefined };

/** Maximises the focused tab's pane, or shows every pane again while one is maximised; a group of one pane has nothing to maximise. */
export const toggleMaximised = (
  spotlight: Spotlight,
  focused: string | undefined,
  paneCount: number
): Result<Spotlight, "unknownPane" | "lastPane"> => {
  if (spotlight.maximised !== undefined) {
    return ok({ ...spotlight, maximised: undefined });
  }
  if (focused === undefined) {
    return err("unknownPane");
  }
  return paneCount === 1
    ? err("lastPane")
    : ok({ ...spotlight, maximised: focused });
};

/** A tab's page entered or left fullscreen; leaving is heard only from the fullscreen tab, and the same spotlight comes back when nothing changes. */
export const afterFullscreen = (
  spotlight: Spotlight,
  tabId: string,
  entered: boolean
): Spotlight => {
  if (entered) {
    return spotlight.fullscreen === tabId
      ? spotlight
      : { ...spotlight, fullscreen: tabId };
  }
  return spotlight.fullscreen === tabId
    ? { ...spotlight, fullscreen: undefined }
    : spotlight;
};

/** The layout a stage shows: the drag's while one is on, and of it only the fullscreen tab's pane, else only the maximised tab's, while it holds them. */
export const shownLayout = (
  tree: Layout,
  showing: Spotlight & {
    /** The layout as a divider drag has moved it, while one is on. */
    readonly drag: Layout | undefined;
  }
): Layout => {
  const base = showing.drag ?? tree;
  for (const tabId of [showing.fullscreen, showing.maximised]) {
    const pane =
      tabId === undefined
        ? undefined
        : panes(base).find((found) => found.tabIds.includes(tabId));
    if (pane !== undefined) {
      return pane;
    }
  }
  return base;
};

/** The pane of the fullscreen tab, while the layout shown holds it. */
export const fullscreenPaneOf = (
  shown: Layout,
  spotlight: Spotlight
): string | undefined =>
  spotlight.fullscreen === undefined
    ? undefined
    : paneOfTab(shown, spotlight.fullscreen);
