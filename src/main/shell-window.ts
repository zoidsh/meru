import { allowsShellWindowOpen } from "#core/overlay.ts";
import type { Platform } from "#core/platform.ts";
import { windowBackground } from "#core/shell-grey.ts";
import { closeHides } from "#core/tray.ts";
import { resolveWindowBounds } from "#core/window-bounds.ts";
import type { Displays } from "#platform/displays.ts";
import type { Theme } from "#platform/theme.ts";
import type { AppWindow, WindowFactory } from "#platform/window.ts";

export interface ShellWindowDeps {
  windows: WindowFactory;
  displays: Displays;
  title: string;
  url: string;
  preloadPath: string;
  isMacOS: boolean;
  background: boolean;
  theme: Theme;
}

const DEFAULT_SIZE = { width: 1280, height: 800 };

/**
 * Leaves the content view 488px wide beside the strip,
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
  theme,
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
    backgroundColor: windowBackground(theme.isDark()),
    allowsWindowOpen: allowsShellWindowOpen,
  });

  theme.onChange(() => {
    window.setBackgroundColor(windowBackground(theme.isDark()));
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

/**
 * Brings the window back, hidden or minimized: for a second launch, the Dock,
 * the tray and a notification's click. In the background it is only shown,
 * never focused, so Meru never takes the foreground.
 */
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

export interface HideOnCloseDeps {
  window: Pick<
    AppWindow,
    "onClose" | "hide" | "isFullScreen" | "leaveFullScreen" | "onSessionEnd"
  >;
  platform: Platform;
  /** Read at each close, as the setting may have changed. */
  trayShown: () => boolean;
}

/**
 * Closing the window hides it where something can bring it back, until Meru
 * quits. A quit marks itself before the window closes; one that closes the
 * windows first, as an update's install does, must call `markQuitting`.
 */
export const hideOnClose = ({
  window,
  platform,
  trayShown,
}: HideOnCloseDeps) => {
  let quitting = false;

  const markQuitting = () => {
    quitting = true;
  };

  window.onClose((event) => {
    if (!closeHides({ platform, trayShown: trayShown(), quitting })) {
      return;
    }

    event.preventDefault();

    // A full screen window hidden on macOS leaves a black screen behind:
    // https://github.com/electron/electron/issues/39572
    if (platform === "darwin" && window.isFullScreen()) {
      window.leaveFullScreen(window.hide);

      return;
    }

    window.hide();
  });
  // A shutdown or sign-out waits on every window that will not close.
  window.onSessionEnd(markQuitting);

  return { markQuitting };
};
