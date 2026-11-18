import { findRectangle } from "./find.ts";
import { contentViewBounds } from "./layout.ts";
import { ownWindowFindOfFrame, ownWindowOfFrame } from "./own-window.ts";
import type { PaneDirection } from "./pane-tree.ts";
import type { SidebarState } from "./sidebar.ts";
import { selectedProfile } from "./state.ts";
import type { State } from "./state.ts";
import type { Rectangle, Size } from "./window-bounds.ts";

/** The short notices a toast gives, by name. */
export const TOAST_MESSAGES = [
  "no-room",
  "bookmarked",
  "bookmark-removed",
] as const;

export type ToastMessage = (typeof TOAST_MESSAGES)[number];

/** What an overlay over the content views shows; one at a time. */
export type Overlay =
  | { kind: "rename-profile"; profileId: string }
  /**
   * Lists the apps the profile can open a tab of; with `split`, as Open in
   * split, whose pick goes in a new pane that way of the focused one.
   */
  | { kind: "open-app"; profileId: string; split?: PaneDirection }
  /**
   * A short notice at the page area's foot, which takes no focus; `title`
   * names the page a bookmark notice is about.
   */
  | { kind: "toast"; message: ToastMessage; title?: string }
  /**
   * What a tab dragged over the page area would do there, lit up over the
   * pages; it takes no focus, and the drag in the shell keeps the pointer.
   */
  | { kind: "drop"; zone: Rectangle; along: "pane" | "edge"; fits: boolean }
  | { kind: "inbox" }
  /**
   * The find bar over a tab's page, the focused pane's in a split, which
   * takes focus but stays while the page is pressed or the window loses it.
   */
  | { kind: "find"; profileId: string; tabId: string };

/** Whether an overlay leaves focus where it is, taking none and giving none back. */
export const takesNoFocus = (overlay: Pick<Overlay, "kind"> | undefined) =>
  overlay?.kind === "toast" || overlay?.kind === "drop";

/**
 * Whether an overlay stays open when the person presses outside it or the
 * window loses focus: the find bar, beside which the page's matches are
 * clicked.
 */
export const staysOpenOutside = (overlay: Pick<Overlay, "kind"> | undefined) =>
  overlay?.kind === "find";

/**
 * Whether an overlay is a card over the page, which takes the keys a page's
 * commands would; the find bar, a toast and a drop's zone are not.
 */
export const coversPage = (overlay: Pick<Overlay, "kind"> | undefined) =>
  overlay !== undefined && overlay.kind !== "find" && !takesNoFocus(overlay);

/** The view a toast is drawn in, at the page area's bottom right corner. */
export const TOAST_VIEW = { width: 400, height: 88 } as const;

/** The card's width for each width class, in CSS pixels. */
export const OVERLAY_WIDTHS = { narrow: 320, medium: 448, wide: 704 } as const;

export type OverlayWidth = keyof typeof OVERLAY_WIDTHS;

/** Each overlay's width class. */
export const overlayWidth = (overlay: Pick<Overlay, "kind">): OverlayWidth => {
  switch (overlay.kind) {
    case "inbox": {
      return "wide";
    }
    case "open-app": {
      return "medium";
    }
    default: {
      return "narrow";
    }
  }
};

/**
 * Where the overlay's view sits while one is open: a card's over the page
 * area, so the card can be placed in it by CSS and a press beside it lands
 * in the view, which closes it; a toast's only where the toast is, so the
 * pages beside it take their own presses, as does the find bar's, at the
 * top right of `pane`, the focused one placed in the page area, or of the
 * page area outside a split.
 */
export const overlayRectangle = (
  contentSize: Size,
  sidebar: SidebarState,
  overlay: Pick<Overlay, "kind">,
  pane?: Rectangle
): Rectangle => {
  const area = contentViewBounds(contentSize, sidebar);

  if (overlay.kind === "find") {
    return findRectangle(area, pane);
  }

  if (overlay.kind !== "toast") {
    return area;
  }

  const width = Math.min(TOAST_VIEW.width, area.width);
  const height = Math.min(TOAST_VIEW.height, area.height);

  return {
    x: area.x + area.width - width,
    y: area.y + area.height - height,
    width,
    height,
  };
};

export type OverlayEvent =
  /** Replaces whatever is open. */
  | { kind: "open"; overlay: Overlay }
  | { kind: "close" }
  /** Main's state changed from `previous` to `next`. */
  | { kind: "state-changed"; previous: State; next: State };

const selection = (state: State) => {
  const profile = selectedProfile(state);

  return `${profile.id}/${profile.selectedTabId}`;
};

/**
 * The overlay open after `event`. What is underneath changing, another
 * profile or tab selected, closes the rename panel, New tab and the find
 * bar, as does their profile going. The unified inbox,
 * over every profile, keeps its own rules.
 */
export const transitionOverlay = (
  current: Overlay | undefined,
  event: OverlayEvent
): Overlay | undefined => {
  switch (event.kind) {
    case "open": {
      return event.overlay;
    }
    case "close": {
      return undefined;
    }
    default: {
      if (
        current?.kind === "inbox" ||
        current?.kind === "toast" ||
        current?.kind === "drop"
      ) {
        return current;
      }

      if (
        !current ||
        selection(event.previous) !== selection(event.next) ||
        !event.next.profiles.some((profile) => profile.id === current.profileId)
      ) {
        return undefined;
      }

      return current;
    }
  }
};

/** The name the shell's `window.open` gives the overlay's document. */
export const OVERLAY_FRAME_NAME = "meru-overlay";

/**
 * Whether the shell is opening one of its own blank documents, the
 * overlay's, or a tab's own window's titlebar or find bar: the only things it may open,
 * which then live in the shell's process for its React tree to draw into.
 */
export const isShellDocument = ({
  url,
  frameName,
}: {
  url: string;
  frameName: string;
}) =>
  url === "about:blank" &&
  (frameName === OVERLAY_FRAME_NAME ||
    ownWindowOfFrame(frameName) !== undefined ||
    ownWindowFindOfFrame(frameName) !== undefined);
