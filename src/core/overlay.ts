import { DOWNGRADE_TOASTS } from "./entitlement.ts";
import { findRectangle } from "./find.ts";
import { contentViewBounds } from "./layout.ts";
import type { ShellFrame } from "./layout.ts";
import {
  ownWindowCardOfFrame,
  ownWindowFindOfFrame,
  ownWindowOfFrame,
} from "./own-window.ts";
import type { PaneDirection } from "./pane-tree.ts";
import type { Platform } from "./platform.ts";
import { selectedProfile } from "./state.ts";
import type { State } from "./state.ts";
import type { UpdateCard } from "./updates.ts";
import type { Rectangle, Size } from "./window-bounds.ts";

/** The short notices a toast gives, by name. */
export const TOAST_MESSAGES = [
  "no-room",
  "bookmarked",
  "bookmark-removed",
  "downloads-folder-missing",
  "one-profile",
  "email-links-pro",
  "screen-source-gone",
  ...DOWNGRADE_TOASTS,
  "license-refused",
  "trial-ended",
] as const;

export type ToastMessage = (typeof TOAST_MESSAGES)[number];

/** The toasts that say what needs Meru Pro, which carry an Upgrade button. */
export const UPGRADE_TOASTS = [
  "one-profile",
  "email-links-pro",
] as const satisfies readonly ToastMessage[];

/** Whether the toast carries Upgrade. */
export const offersUpgrade = (message: ToastMessage) =>
  (UPGRADE_TOASTS as readonly ToastMessage[]).includes(message);

/** What an overlay over the content views shows; one at a time. */
export type Overlay =
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
  | { kind: "downloads" }
  /**
   * The card at a launch whose license or trial could not be confirmed,
   * which only its own buttons and Escape close.
   */
  | { kind: "license" }
  /**
   * The find bar over a tab's page, the focused pane's in a split, which
   * takes focus but stays while the page is pressed or the window loses it.
   */
  | { kind: "find"; profileId: string; tabId: string }
  /**
   * A version ready to install or one that could not be verified, at the
   * page area's bottom right, shown only while nothing else holds the view
   * and taking no focus as it appears.
   */
  | ({ kind: "update" } & UpdateCard)
  /**
   * Meru's picker for the screen or window a page of the tab asked to
   * share, which answers the page as it closes.
   */
  | { kind: "screen-picker"; profileId: string; tabId: string }
  /**
   * Which of `profileIds`, in that order, writes an email a link asked for,
   * answered as it closes.
   */
  | { kind: "profile-question"; profileIds: string[] };

/** Whether an overlay leaves focus where it is, taking none and giving none back. */
export const takesNoFocus = (overlay: Pick<Overlay, "kind"> | undefined) =>
  overlay?.kind === "toast" || overlay?.kind === "drop";

/**
 * Whether an overlay stays open when the person presses outside it: the
 * find bar, beside which the page's matches are clicked, the license
 * notice, which says something to read once, and the update card.
 */
export const staysOpenOnPressOutside = (
  overlay: Pick<Overlay, "kind"> | undefined
) =>
  overlay?.kind === "find" ||
  overlay?.kind === "license" ||
  overlay?.kind === "update";

/**
 * Whether an overlay stays open as the window loses focus: those a press
 * outside leaves, the screen picker, whose person may look at the windows to
 * share or open the system's settings, a toast, which takes no focus and
 * runs out its time whatever has the keys, and the profile question, asked
 * for a link clicked in another app, which may keep the focus a moment.
 */
export const staysOpenOnBlur = (overlay: Pick<Overlay, "kind"> | undefined) =>
  staysOpenOnPressOutside(overlay) ||
  overlay?.kind === "screen-picker" ||
  overlay?.kind === "toast" ||
  overlay?.kind === "profile-question";

/**
 * Whether an overlay is a card over the page, which takes the keys a page's
 * commands would; the find bar, a toast and a drop's zone are not.
 */
export const coversPage = (overlay: Pick<Overlay, "kind"> | undefined) =>
  overlay !== undefined &&
  overlay.kind !== "find" &&
  overlay.kind !== "update" &&
  !takesNoFocus(overlay);

/**
 * Whether what is open leaves the view to what waits for it, a toast, the
 * license notice or the find bar: nothing, or the update card, which gives
 * way and comes back once the view is free again.
 */
export const leavesViewFree = (overlay: Pick<Overlay, "kind"> | undefined) =>
  overlay === undefined || overlay.kind === "update";

/**
 * The view a toast is drawn in, at the page area's bottom right corner: the
 * toast, at most 384px wide and two lines tall (74px), 16px in from its right
 * and bottom, and 16px to its left and 6px above for the component's shadow.
 * A press in that margin closes the toast rather than reaching the page, so
 * it stays no larger than the shadow needs.
 */
export const TOAST_VIEW = { width: 416, height: 96 } as const;

/**
 * The view the update card is drawn in, at the page area's bottom right
 * corner: the 320px card 8px in from the page's right and bottom, as tall
 * as three lines of text and its buttons (124px), so the pages beside it
 * take their own presses.
 */
export const UPDATE_CARD_VIEW = { width: 328, height: 132 } as const;

/** The card's width for each width class, in CSS pixels. */
export const OVERLAY_WIDTHS = { medium: 448, wide: 704 } as const;

export type OverlayWidth = keyof typeof OVERLAY_WIDTHS;

/** Each overlay's width class. */
export const overlayWidth = (overlay: Pick<Overlay, "kind">): OverlayWidth =>
  overlay.kind === "inbox" || overlay.kind === "screen-picker"
    ? "wide"
    : "medium";

/**
 * Where the overlay's view sits while one is open: a card's over the page
 * area, so the card can be placed in it by CSS and a press beside it lands
 * in the view, which closes it; a toast's or the update card's only where
 * it is, so the pages beside it take their own presses, as does the find
 * bar's, at the top right of `pane`, the focused one placed in the page
 * area, or of the page area outside a split.
 */
export const overlayRectangle = (
  contentSize: Size,
  frame: ShellFrame,
  platform: Platform,
  overlay: Pick<Overlay, "kind">,
  pane?: Rectangle
): Rectangle => {
  const area = contentViewBounds(contentSize, frame, platform);

  if (overlay.kind === "find") {
    return findRectangle(area, pane);
  }

  if (overlay.kind !== "toast" && overlay.kind !== "update") {
    return area;
  }

  const corner = overlay.kind === "toast" ? TOAST_VIEW : UPDATE_CARD_VIEW;
  const width = Math.min(corner.width, area.width);
  const height = Math.min(corner.height, area.height);

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
 * profile or tab selected, closes New tab and the find bar, as does their
 * profile going. The unified inbox and Downloads, each over every profile,
 * keep their own rules, and the profile question is about no tab.
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
        current?.kind === "downloads" ||
        current?.kind === "license" ||
        current?.kind === "update" ||
        current?.kind === "toast" ||
        current?.kind === "drop" ||
        current?.kind === "profile-question"
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
    ownWindowFindOfFrame(frameName) !== undefined ||
    ownWindowCardOfFrame(frameName) !== undefined);
