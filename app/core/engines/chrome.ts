import type { WindowPort } from "../ports.ts";
import type { Platform } from "../records/platform.ts";
import type { Rect } from "../records/rect.ts";
import type { Theme } from "../records/theme.ts";
import type { TitleBar, TitleBarOverlay } from "../records/title-bar.ts";
import type { Flush } from "./layout.ts";
import type { Sidebar } from "./sidebar.ts";

/** The height of the titlebar row across the window's top, which the window's own controls are centred on. */
export const TITLEBAR_HEIGHT = 40;

interface ChromeColors {
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

interface WindowLook {
  readonly platform: Platform;
  readonly theme: Theme;
  /** Whether a Linux window draws its controls, which some window managers have no room for. */
  readonly linuxControls: boolean;
}

export const titleBarOf = (options: WindowLook): TitleBar => {
  const { platform, theme, linuxControls } = options;
  const colors = chromeColors(theme);
  // One pixel short of the row, so classic's seam under the titlebar shows beneath the window controls too; in modern that pixel is the titlebar's own ground.
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

/** What a window paints in the theme: its ground, and the overlay of its window controls where Electron recolours one, which it does only on Windows and Linux, since macOS draws its traffic lights in its own colours. */
export const windowColours = (
  options: WindowLook
): {
  readonly background: string;
  readonly overlay: TitleBarOverlay | null;
} => ({
  background: chromeColors(options.theme).background,
  overlay: options.platform === "darwin" ? null : titleBarOf(options).overlay,
});

export const recolourWindow = (
  window: Pick<WindowPort, "setBackgroundColor" | "setTitleBarOverlay">,
  options: WindowLook
): void => {
  const colours = windowColours(options);
  window.setBackgroundColor(colours.background);
  if (colours.overlay !== null) {
    window.setTitleBarOverlay(colours.overlay);
  }
};

/** How much of the window's content area the chrome takes before the panes: the titlebar above them, the sidebar to their left. */
export interface ChromeInsets {
  readonly top: number;
  readonly left: number;
}

/** What the chrome takes: the titlebar's row, and the sidebar's width while it shows. */
export const chromeInsets = (sidebar: Sidebar): ChromeInsets => ({
  left: sidebar.kind === "shown" ? sidebar.width : 0,
  top: TITLEBAR_HEIGHT,
});

export interface StageArea {
  /** The part of the content area the panes are laid out in. */
  readonly area: Rect;
  /** The sides where the panes meet the chrome rather than the window's edge, which keep no inset, so the chrome's own spacing stands. */
  readonly flush: Flush;
}

export const stageArea = (content: Rect, insets: ChromeInsets): StageArea => {
  const top = Math.min(insets.top, content.height);
  const left = Math.min(insets.left, content.width);
  return {
    area: {
      height: content.height - top,
      width: content.width - left,
      x: content.x + left,
      y: content.y + top,
    },
    flush: { left: insets.left > 0, top: insets.top > 0 },
  };
};
