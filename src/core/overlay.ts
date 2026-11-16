import { OVERLAY_MARGIN } from "./layout.ts";
import { selectedProfile } from "./state.ts";
import type { State } from "./state.ts";
import type { Size } from "./window-bounds.ts";

/** What an overlay over the content views shows; one at a time. */
export interface Overlay {
  kind: "rename-profile";
  profileId: string;
}

/**
 * The view's size for each overlay, its margin included, so main can place
 * the view before the shell draws into it: the rename field is a 36px input
 * in a card with 8px of padding.
 */
export const overlaySize = (overlay: Overlay): Size => {
  switch (overlay.kind) {
    default: {
      return {
        width: 360 + OVERLAY_MARGIN * 2,
        height: 36 + 8 * 2 + OVERLAY_MARGIN * 2,
      };
    }
  }
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
