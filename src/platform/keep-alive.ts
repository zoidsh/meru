import { WebContentsView, session } from "electron";

import { scrub } from "#core/log.ts";
import type { Log } from "#core/log.ts";

export interface HiddenPage {
  close: () => void;
}

export interface KeepAlivePages {
  /** The expiry, in ms, of each persistent cookie of `name` in the partition. */
  readExpiries: (partition: string, name: string) => Promise<number[]>;
  /**
   * Called with the expiry, in ms, each time a persistent cookie of `name` is
   * set in the partition, and with nothing when one is removed other than by
   * being set anew, as signing out does; never with its value. Returns what
   * stops it.
   */
  watchCookie: (
    partition: string,
    name: string,
    listener: (expiresAt: number | undefined) => void
  ) => () => void;
  /**
   * Loads `url` in the partition in a view no window shows, muted, with no
   * preload, dialogs, windows or downloads.
   */
  open: (partition: string, url: string, log: Log) => HiddenPage;
}

const SECOND = 1000;

export const createKeepAlivePages = (): KeepAlivePages => ({
  readExpiries: async (partition, name) => {
    const cookies = await session
      .fromPartition(partition)
      .cookies.get({ name });

    return cookies.flatMap((cookie) =>
      cookie.expirationDate === undefined
        ? []
        : [cookie.expirationDate * SECOND]
    );
  },
  watchCookie: (partition, name, listener) => {
    const { cookies } = session.fromPartition(partition);
    const changed = (
      _event: Electron.Event,
      cookie: Electron.Cookie,
      cause: string,
      removed: boolean
    ) => {
      if (cookie.name !== name) {
        return;
      }

      // A rotation removes the old value as "overwrite" before it sets the new.
      if (removed && cause !== "overwrite") {
        listener(undefined);
      } else if (!removed && cookie.expirationDate !== undefined) {
        listener(cookie.expirationDate * SECOND);
      }
    };

    cookies.on("changed", changed);

    return () => {
      cookies.off("changed", changed);
    };
  },
  open: (partition, url, log) => {
    const hidden = session.fromPartition(partition);
    // Never attached: a view no window holds still loads and runs its page.
    const view = new WebContentsView({
      webPreferences: {
        partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        disableDialogs: true,
      },
    });
    const { webContents } = view;
    // The session is the profile's, its tabs' downloads included.
    const download = (
      event: Electron.Event,
      _item: Electron.DownloadItem,
      from: Electron.WebContents
    ) => {
      if (from === webContents) {
        event.preventDefault();
      }
    };

    let closed = false;

    hidden.on("will-download", download);
    webContents.setAudioMuted(true);
    webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    const load = async () => {
      try {
        await webContents.loadURL(url);
      } catch (error) {
        // Closing the page aborts a load still under way.
        if (!closed) {
          log("keep-alive-load-failed", { code: scrub.code(error) });
        }
      }
    };

    void load();

    return {
      close: () => {
        closed = true;
        hidden.off("will-download", download);

        if (!webContents.isDestroyed()) {
          webContents.close();
        }
      },
    };
  },
});
