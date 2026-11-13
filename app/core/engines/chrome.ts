import type { Rect } from "../records/rect.ts";
import type { TitleBar, TitleBarOverlay } from "../records/title-bar.ts";

export type Theme = "light" | "dark";

/** The height of the titlebar row across the window's top, which the window's own controls are centred on. */
export const TITLEBAR_HEIGHT = 40;

export interface ChromeColors {
  readonly background: string;
  readonly foreground: string;
}

/** The chrome's ground and ink, as hex, which is all a window's background and its title bar overlay take: a neutral grey either way, which the panes, white or near-black as Google draws them, sit on. */
export const chromeColors = (theme: Theme): ChromeColors =>
  theme === "dark"
    ? { background: "#1d1d24", foreground: "#e2e2ea" }
    : { background: "#ececf1", foreground: "#2a2a30" };

// `hiddenInset` pins the lights 11px from the top and skips the centring `titleBarOverlay.height` would do, so centring them on a taller row takes an explicit position; x repeats Electron's own inset, so only the height moves.
const TRAFFIC_LIGHT_HEIGHT = 12;
const TRAFFIC_LIGHT_X = 12;

export const titleBarOf = (options: {
  readonly platform: string;
  readonly theme: Theme;
  /** Whether a Linux window draws its controls, which some window managers have no room for. */
  readonly linuxControls: boolean;
}): TitleBar => {
  const { platform, theme, linuxControls } = options;
  const colors = chromeColors(theme);
  // One pixel short of the row, so the titlebar's bottom border shows under the controls.
  const overlay: TitleBarOverlay = {
    color: colors.background,
    height: TITLEBAR_HEIGHT - 1,
    symbolColor: colors.foreground,
  };
  if (platform === "darwin") {
    return {
      overlay,
      style: "hiddenInset",
      trafficLights: {
        x: TRAFFIC_LIGHT_X,
        y: (TITLEBAR_HEIGHT - TRAFFIC_LIGHT_HEIGHT) / 2,
      },
    };
  }
  return {
    overlay: platform === "linux" && !linuxControls ? null : overlay,
    style: "hidden",
    trafficLights: null,
  };
};

/** How much of the window's content area the chrome takes before the panes: the titlebar above them, the sidebar to their left. */
export interface ChromeInsets {
  readonly top: number;
  readonly left: number;
}

/** The part of the content area the panes are laid out in. */
export const stageArea = (content: Rect, insets: ChromeInsets): Rect => {
  const top = Math.min(insets.top, content.height);
  const left = Math.min(insets.left, content.width);
  return {
    height: content.height - top,
    width: content.width - left,
    x: content.x + left,
    y: content.y + top,
  };
};
