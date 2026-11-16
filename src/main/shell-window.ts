import { resolveWindowBounds } from "#core/window-bounds.ts";
import type { Displays } from "#platform/displays.ts";
import type { AppWindow, WindowFactory } from "#platform/window.ts";

export interface ShellWindowDeps {
  windows: WindowFactory;
  displays: Displays;
  title: string;
  url: string;
  preloadPath: string;
  isMacOS: boolean;
  background: boolean;
}

const DEFAULT_SIZE = { width: 1280, height: 800 };

const MINIMUM_SIZE = { width: 320, height: 256 };

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
