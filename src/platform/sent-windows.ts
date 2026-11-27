import { BrowserWindow, webContents } from "electron";

/**
 * The window a compose page lives in, found by its web contents: an email
 * link's compose window or Gmail's own pop-out, both Electron windows of
 * their own.
 */
const windowOf = (webContentsId: number) => {
  const contents = webContents.fromId(webContentsId);
  const window =
    contents && !contents.isDestroyed()
      ? BrowserWindow.fromWebContents(contents)
      : null;

  return window && !window.isDestroyed() ? window : undefined;
};

/** The compose windows main may hide, show again and close, by web contents. */
export interface SentWindows {
  hide: (webContentsId: number) => void;
  show: (webContentsId: number) => void;
  /** Closes it at once, asking nothing, as its email has gone. */
  destroy: (webContentsId: number) => void;
  /** Whether its page's timers slow down while it is hidden, as by default. */
  setThrottling: (webContentsId: number, throttled: boolean) => void;
  /** Told once, when it closes, whoever closed it; at once if it is gone. */
  onClosed: (webContentsId: number, listener: () => void) => void;
}

/**
 * Hides, shows again and closes a compose window main took off screen as it
 * sent; `reveal` shows one again as any window of Meru's is brought back.
 */
export const createSentWindows = (
  reveal: (window: BrowserWindow) => void
): SentWindows => ({
  hide: (webContentsId) => {
    windowOf(webContentsId)?.hide();
  },
  show: (webContentsId) => {
    const window = windowOf(webContentsId);

    if (window) {
      reveal(window);
    }
  },
  destroy: (webContentsId) => {
    windowOf(webContentsId)?.destroy();
  },
  setThrottling: (webContentsId, throttled) => {
    windowOf(webContentsId)?.webContents.setBackgroundThrottling(throttled);
  },
  onClosed: (webContentsId, listener) => {
    const window = windowOf(webContentsId);

    if (window) {
      window.once("closed", listener);
    } else {
      listener();
    }
  },
});
