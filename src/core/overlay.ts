import { contentViewBounds } from "./layout.ts";
import type { ProfileMenuRequest } from "./profile-menu.ts";
import type { SidebarState } from "./sidebar.ts";
import { selectedProfile } from "./state.ts";
import type { State } from "./state.ts";
import type { TabMenuRequest } from "./tab-menu.ts";
import { findTab } from "./tabs.ts";
import type { Rectangle, Size } from "./window-bounds.ts";

/** What an overlay over the content views shows; one at a time. */
export type Overlay =
  | { kind: "rename-profile"; profileId: string }
  /** Lists the apps the profile can open a tab of. */
  | { kind: "open-app"; profileId: string }
  | { kind: "inbox" }
  /** A tab's context menu, at the point it was asked for. */
  | ({ kind: "tab-menu" } & TabMenuRequest)
  /** A profile button's context menu, at the point it was asked for. */
  | ({ kind: "profile-menu" } & ProfileMenuRequest);

/**
 * The overlays that are menus: drawn at a point over the whole content area,
 * and on closing giving focus back to the control they were opened on.
 */
export const MENU_KINDS = ["tab-menu", "profile-menu"] as const;

export type MenuKind = (typeof MENU_KINDS)[number];

export const isMenu = (overlay: Pick<Overlay, "kind"> | undefined) =>
  overlay !== undefined &&
  (MENU_KINDS as readonly string[]).includes(overlay.kind);

/** Whether a menu's point lies in the content area, in whole CSS pixels. */
export const menuPointInside = (
  { x, y }: { x: number; y: number },
  contentSize: Size
) =>
  Number.isInteger(x) &&
  Number.isInteger(y) &&
  x >= 0 &&
  y >= 0 &&
  x <= contentSize.width &&
  y <= contentSize.height;

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
 * Where the overlay's view sits while one is open: a card's over the page
 * area, so the card can be placed in it by CSS and a press beside it lands
 * in the view, which closes it; a menu's over the window's whole content
 * area, titlebar and sidebar too, so it can reach over them from the tab it
 * belongs to and takes the press that closes it.
 */
export const overlayRectangle = (
  contentSize: Size,
  sidebar: SidebarState,
  overlay: Pick<Overlay, "kind">
): Rectangle =>
  isMenu(overlay)
    ? { x: 0, y: 0, ...contentSize }
    : contentViewBounds(contentSize, sidebar);

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
 * profile or tab selected, closes the rename panel, Open app and a tab's
 * menu, as does their profile going, and the menu's tab. The unified inbox,
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
      if (current?.kind === "inbox") {
        return current;
      }

      if (
        !current ||
        selection(event.previous) !== selection(event.next) ||
        !event.next.profiles.some(
          (profile) => profile.id === current.profileId
        ) ||
        (current.kind === "tab-menu" && !findTab(event.next, current))
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
