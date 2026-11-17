import { OVERLAY_MARGIN, TAB_STRIP_WIDTH, overlayBounds } from "./layout.ts";
import type { Design } from "./settings.ts";
import { selectedProfile } from "./state.ts";
import type { State } from "./state.ts";
import type { Rectangle, Size } from "./window-bounds.ts";

/** What an overlay over the content views shows; one at a time. */
export interface Overlay {
  kind: "rename-profile";
  profileId: string;
}

/**
 * How far below the top of the content view an overlay's view sits, so what
 * it draws reads as over the page rather than part of the titlebar.
 */
export const OVERLAY_OFFSET = 8;

/**
 * The view's size for each overlay, its margin included, so main can place
 * the view before the shell draws into it: the rename card is 360px wide,
 * with 12px of padding around a 20px heading, an 8px gap and a 36px field.
 */
export const overlaySize = (overlay: Overlay): Size => {
  switch (overlay.kind) {
    default: {
      return {
        width: 360 + OVERLAY_MARGIN * 2,
        height: 12 + 20 + 8 + 36 + 12 + OVERLAY_MARGIN * 2,
      };
    }
  }
};

/** Where the overlay's view sits in a window's content area. */
export const overlayRectangle = (
  contentSize: Size,
  design: Design,
  overlay: Overlay
): Rectangle =>
  overlayBounds(
    contentSize,
    TAB_STRIP_WIDTH,
    design,
    overlaySize(overlay),
    OVERLAY_OFFSET
  );

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
 * profile or tab selected, closes it, as does its profile going.
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

/** The one name the shell's `window.open` may use, for the overlay's document. */
export const OVERLAY_FRAME_NAME = "meru-overlay";

/**
 * The shell may open exactly one thing, the overlay's own blank document,
 * which then lives in the shell's process for its React tree to draw into.
 */
export const allowsShellWindowOpen = ({
  url,
  frameName,
}: {
  url: string;
  frameName: string;
}) => url === "about:blank" && frameName === OVERLAY_FRAME_NAME;
