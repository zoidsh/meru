import type { AppWindow } from "#platform/window.ts";

import { revealWindow } from "./windows.ts";

export type SettingsWindowHandle = Pick<
  AppWindow,
  | "webContentsId"
  | "loadURL"
  | "once"
  | "show"
  | "showInactive"
  | "focus"
  | "isDestroyed"
  | "isMinimized"
  | "restore"
  | "onClosed"
  | "on"
>;

export interface SettingsWindowDeps<Window extends SettingsWindowHandle> {
  /** Opens a new window, hidden until shown. */
  create: () => Window;
  url: string;
  background: boolean;
  /** Enters the window's page as the Settings window's; returns what drops it. */
  register: (webContentsId: number) => () => void;
  /** Called with each window as it is created, before its page loads. */
  prepare: (window: Window) => void;
  log: (message: string) => void;
}

/**
 * The one Settings window: opened again, the open one comes forward; closed,
 * it is gone, and the next open makes a new one. Shown once its page can
 * paint, as the main window is, and never in front under `background`.
 */
export const createSettingsWindow = <Window extends SettingsWindowHandle>({
  create,
  url,
  background,
  register,
  prepare,
  log,
}: SettingsWindowDeps<Window>) => {
  let current: Window | undefined;
  let focused = false;
  const focusListeners = new Set<() => void>();

  const setFocused = (next: boolean) => {
    if (focused === next) {
      return;
    }

    focused = next;

    for (const listener of focusListeners) {
      listener();
    }
  };

  const load = async (window: Window) => {
    try {
      await window.loadURL(url);
    } catch (error) {
      log(
        `The Settings window did not load: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  const open = () => {
    if (current && !current.isDestroyed()) {
      revealWindow(current, background);

      return;
    }

    const window = create();
    const drop = register(window.webContentsId);

    current = window;
    window.onClosed(() => {
      drop();

      if (current === window) {
        current = undefined;
        setFocused(false);
      }
    });
    window.on("focus", () => {
      setFocused(true);
    });
    window.on("blur", () => {
      setFocused(false);
    });
    prepare(window);

    let isShown = false;

    const showOnce = () => {
      if (isShown || window.isDestroyed()) {
        return;
      }

      isShown = true;
      revealWindow(window, background);
    };

    window.once("ready-to-show", showOnce);
    window.once("did-finish-load", showOnce);
    void load(window);
  };

  return {
    open,
    /** The open window, if any. */
    current: () => (current && !current.isDestroyed() ? current : undefined),
    /** Whether it is the window keys go to. */
    isFocused: () => focused,
    /** Tells of `isFocused` changing. */
    onFocusChange: (listener: () => void) => {
      focusListeners.add(listener);
    },
  };
};
