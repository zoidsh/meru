import { contentViewBounds } from "./layout.ts";
import type { SidebarState } from "./sidebar.ts";
import { selectedProfile } from "./state.ts";
import type { State } from "./state.ts";
import type { Rectangle, Size } from "./window-bounds.ts";

/** What an overlay over the content views shows; one at a time. */
export type Overlay =
  | { kind: "rename-profile"; profileId: string }
  /** Lists the apps the profile can open a tab of. */
  | { kind: "open-app"; profileId: string }
  | { kind: "inbox" };

/** The card's width for each width class, in CSS pixels. */
export const OVERLAY_WIDTHS = { narrow: 320, medium: 448, wide: 704 } as const;

export type OverlayWidth = keyof typeof OVERLAY_WIDTHS;

/** Each overlay's width class. */
export const overlayWidth = (overlay: Pick<Overlay, "kind">): OverlayWidth => {
  switch (overlay.kind) {
    case "inbox": {
      return "wide";
    }
    default: {
      return "narrow";
    }
  }
};

/**
 * Where the overlay's view sits while one is open: over the whole content
 * area, so the card can be placed in it by CSS and a press beside it lands
 * in the view, which closes it.
 */
export const overlayRectangle = (
  contentSize: Size,
  sidebar: SidebarState
): Rectangle => contentViewBounds(contentSize, sidebar);

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
 * profile or tab selected, closes the rename panel and Open app, as does
 * their profile going. The unified inbox, over every profile, keeps its own
 * rules.
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
      if (current?.kind === "inbox") {
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
 * Whether the shell is opening the overlay's blank document: the only thing
 * it may open, which then lives in the shell's process for its React tree to
 * draw into.
 */
export const isOverlayDocument = ({
  url,
  frameName,
}: {
  url: string;
  frameName: string;
}) => url === "about:blank" && frameName === OVERLAY_FRAME_NAME;
