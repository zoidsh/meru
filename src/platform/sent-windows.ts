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
  /** Told once, when it closes, whoever closed it; at once if it is gone. */
  onClosed: (webContentsId: number, listener: () => void) => void;
}

/**
 * Hides, shows again and closes a compose window main took off screen as it
 * sent. Under the background flag it is shown without taking the keys.
 */
export const createSentWindows = (background: boolean): SentWindows => ({
  hide: (webContentsId: number) => {
    windowOf(webContentsId)?.hide();
  },
  show: (webContentsId: number) => {
    const window = windowOf(webContentsId);

    if (background) {
      window?.showInactive();
    } else {
      window?.show();
      window?.focus();
    }
  },
  destroy: (webContentsId: number) => {
    windowOf(webContentsId)?.destroy();
  },
  onClosed: (webContentsId: number, listener: () => void) => {
    const window = windowOf(webContentsId);

    if (window) {
      window.once("closed", listener);
    } else {
      listener();
    }
  },
});
