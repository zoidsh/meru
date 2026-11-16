import { resolveWindowBounds } from "#core/window-bounds.ts";
import type { Displays } from "#platform/displays.ts";
import type { AppWindow, WindowFactory } from "#platform/window.ts";

import type { SettingsStore } from "./settings.ts";

export interface ShellWindowDeps {
  windows: WindowFactory;
  displays: Displays;
  title: string;
  url: string;
  preloadPath: string;
  isMacOS: boolean;
  background: boolean;
  vibrancy: boolean;
}

const DEFAULT_SIZE = { width: 1280, height: 800 };

/**
 * Leaves the content view 480px wide in the modern design beside the strip,
 * about where Gmail's narrowest layout still shows a list.
 */
const MINIMUM_SIZE = { width: 720, height: 480 };

/**
 * Opens the shell window and shows it once its page can paint: on
 * `ready-to-show`, or on `did-finish-load` where that comes first, since on
 * Wayland `ready-to-show` sometimes never fires.
 */
export const createShellWindow = ({
  windows,
  displays,
  title,
  url,
  preloadPath,
  isMacOS,
  background,
  vibrancy,
}: ShellWindowDeps) => {
  const window = windows.create({
    title,
    bounds: resolveWindowBounds({
      saved: undefined,
      displays: displays.getAll(),
      defaultSize: DEFAULT_SIZE,
      minimumSize: MINIMUM_SIZE,
    }),
    minimumSize: MINIMUM_SIZE,
    titleBarStyle: isMacOS ? "hiddenInset" : "default",
    preloadPath,
    contentUrl: url,
    vibrancy,
  });

  let isShown = false;

  const showOnce = () => {
    if (isShown || window.isDestroyed()) {
      return;
    }

    isShown = true;

    if (background) {
      window.showInactive();
    } else {
      window.show();
    }
  };

  window.once("ready-to-show", showOnce);
  window.once("did-finish-load", showOnce);

  return { window, load: () => window.loadURL(url) };
};

/** Gives the window the vibrancy the settings hold, each time they change it. */
export const followVibrancy = (
  window: Pick<AppWindow, "setVibrancy">,
  settings: Pick<SettingsStore, "get" | "onChange">
) => {
  settings.onChange("vibrancy", () => {
    window.setVibrancy(settings.get("vibrancy"));
  });
};

/** Brings the window back for a second launch, which exits straight after. */
export const revealWindow = (window: AppWindow, background: boolean) => {
  if (window.isDestroyed()) {
    return;
  }

  if (window.isMinimized()) {
    window.restore();
  }

  if (background) {
    window.showInactive();
  } else {
    window.show();
    window.focus();
  }
};
