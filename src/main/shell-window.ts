import { isShellDocument } from "#core/overlay.ts";
import type { Platform } from "#core/platform.ts";
import { windowBackground } from "#core/shell-grey.ts";
import { closeHides } from "#core/tray.ts";
import type { Displays } from "#platform/displays.ts";
import type { Theme } from "#platform/theme.ts";
import type { AppWindow, WindowFactory } from "#platform/window.ts";

import { openingOptions } from "./windows.ts";

export interface ShellWindowDeps {
  windows: WindowFactory;
  displays: Displays;
  title: string;
  url: string;
  preloadPath: string;
  isMacOS: boolean;
  background: boolean;
  theme: Pick<Theme, "isDark" | "onChange">;
}

const DEFAULT_SIZE = { width: 1280, height: 800 };

/**
 * Chrome's height on macOS. Its 500 width would leave the titlebar's profile
 * row, with the sidebar hidden and New tab in the titlebar, too narrow to
 * show a short-named profile clear of the row's arrows.
 */
const MINIMUM_SIZE = { width: 540, height: 375 };

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
    // Where the main window was is not kept: it opens at its default size.
    ...openingOptions({
      displays,
      saved: undefined,
      defaultSize: DEFAULT_SIZE,
      minimumSize: MINIMUM_SIZE,
      title,
      isMacOS,
      backgroundColor: windowBackground(theme.isDark()),
    }),
    preloadPath,
    contentUrl: url,
    isShellDocument,
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

export interface HideOnCloseDeps {
  window: Pick<
    AppWindow,
    | "onClose"
    | "onClosed"
    | "hide"
    | "isFullScreen"
    | "leaveFullScreen"
    | "onSessionEnd"
  >;
  platform: Platform;
  /** Read at each close, as the setting may have changed. */
  trayShown: () => boolean;
  quit: () => void;
}

/**
 * Closing the window hides it where something can bring it back, until Meru
 * quits; where nothing could, closing it quits Meru, whatever tab is in a
 * window of its own, which stays there for the next launch. A quit marks
 * itself before the window closes; one that closes the windows first, as an
 * update's install does, must call `markQuitting`.
 */
export const hideOnClose = ({
  window,
  platform,
  trayShown,
  quit,
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
  // A tab's own window would keep Meru running with no main window.
  window.onClosed(() => {
    if (!quitting) {
      quit();
    }
  });
  // A shutdown or sign-out waits on every window that will not close.
  window.onSessionEnd(markQuitting);

  return { markQuitting };
};
