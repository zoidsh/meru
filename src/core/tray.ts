import type { Platform } from "./platform.ts";
import type { TrayIconColor } from "./settings.ts";
import { firstWithUnread } from "./unread.ts";

/** One template image on macOS, which the menu bar tints itself. */
const MENU_BAR_IMAGE = "IconMenuBarTemplate.png";

const trayImageExtension = (platform: Platform) =>
  platform === "win32" ? "ico" : "png";

/**
 * The tray's image. On Windows and Linux it changes with unread mail, and a
 * light one is drawn on a dark theme and a dark one on a light theme, unless
 * the person chose one.
 */
export const trayImageName = ({
  platform,
  hasUnread,
  color,
  isDark,
}: {
  platform: Platform;
  hasUnread: boolean;
  color: TrayIconColor;
  isDark: boolean;
}) => {
  if (platform === "darwin") {
    return MENU_BAR_IMAGE;
  }

  const light = color === "system" ? isDark : color === "light";
  const shade = light ? "Light" : "Dark";

  return `IconTray${hasUnread ? "Unread" : ""}-${shade}.${trayImageExtension(platform)}`;
};

/** Every image the tray can show on `platform`, which is all a build packs. */
export const trayImageNames = (platform: Platform) =>
  platform === "darwin"
    ? [MENU_BAR_IMAGE, MENU_BAR_IMAGE.replace(".png", "@2x.png")]
    : [false, true].flatMap((hasUnread) =>
        (["light", "dark"] as const).map((color) =>
          trayImageName({ platform, hasUnread, color, isDark: false })
        )
      );

export interface TrayProfile {
  id: string;
  name: string;
  unreadCount: number | null;
}

export type TrayEntry =
  | { kind: "profile"; profileId: string; name: string; unreadCount: number }
  | { kind: "separator" }
  /** Hides the window while it shows, else shows it. */
  | { kind: "toggle"; hides: boolean }
  | { kind: "quit" };

/** The tray's menu: each profile and its count, show or hide, then quit. */
export const trayEntries = ({
  profiles,
  windowVisible,
}: {
  profiles: readonly TrayProfile[];
  windowVisible: boolean;
}): TrayEntry[] => [
  ...profiles.map((profile) => ({
    kind: "profile" as const,
    profileId: profile.id,
    name: profile.name,
    unreadCount: profile.unreadCount ?? 0,
  })),
  { kind: "separator" },
  { kind: "toggle", hides: windowVisible },
  { kind: "separator" },
  { kind: "quit" },
];

/**
 * A name shown as it is in a native menu item, where Windows and Linux read
 * `&` as the mark of an access key.
 */
export const menuText = (text: string, platform: Platform) =>
  platform === "darwin" ? text : text.replaceAll("&", "&&");

export type TrayClick =
  | { kind: "hide" }
  /** Shows the window, first selecting `profileId` where there is one. */
  | { kind: "reveal"; profileId?: string };

/** What a click on the icon itself does, the menu aside. */
export const trayClick = ({
  windowVisible,
  jumpsToUnread,
  profiles,
}: {
  windowVisible: boolean;
  jumpsToUnread: boolean;
  profiles: readonly TrayProfile[];
}): TrayClick => {
  if (windowVisible) {
    return { kind: "hide" };
  }

  const profileId = jumpsToUnread ? firstWithUnread(profiles)?.id : undefined;

  return profileId ? { kind: "reveal", profileId } : { kind: "reveal" };
};

/**
 * Whether the tray's menu is the icon's own, opened by any click, or popped
 * up on a right click while a left click toggles the window. Linux's status
 * icons report no clicks of their own, only the menu.
 */
export const trayMenuOpensOnClick = (platform: Platform) =>
  platform === "linux";

/**
 * Whether closing the window hides it rather than letting it close, which
 * quits. On macOS it always hides, and the Dock brings it back. Elsewhere only
 * the tray could bring it back, so it hides only while the tray is shown.
 */
export const closeHides = ({
  platform,
  trayShown,
  quitting,
}: {
  platform: Platform;
  trayShown: boolean;
  quitting: boolean;
}) => !quitting && (platform === "darwin" || trayShown);
