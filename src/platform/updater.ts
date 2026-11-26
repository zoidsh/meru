import { app } from "electron";

import type { ChannelOptions, UpdateEvent } from "#core/updates.ts";

/** What updates this install: the one adapter over electron-updater. */
export interface Updater {
  /** Whether the library can update this install: a packed one. */
  canUpdate: () => boolean;
  setChannel: (options: ChannelOptions) => void;
  /** Settles once the check has answered, the download it starts running on. */
  check: () => Promise<void>;
  /** Quits and installs what was downloaded, relaunching after. */
  quitAndInstall: () => void;
  /** Every event, an error with its message. */
  onEvent: (listener: (event: UpdateEvent, message?: string) => void) => void;
}

// The code electron-updater gives an update whose signature does not match
// the publisher in `app-update.yml`.
const INVALID_SIGNATURE = "ERR_UPDATER_INVALID_SIGNATURE";

const isInvalidSignature = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === INVALID_SIGNATURE;

/**
 * The library's own updater, its download and install at quit left on as it
 * defaults them. Its logger is off, since it logs the feed's URLs whole;
 * main logs each error itself. The library loads here alone, so no build
 * but the installed Meru's evaluates it.
 */
export const createUpdater = async (): Promise<Updater> => {
  const { autoUpdater } = await import("electron-updater");

  autoUpdater.logger = null;

  return {
    canUpdate: () => autoUpdater.isUpdaterActive(),
    setChannel: ({ channel, allowPrerelease, allowDowngrade }) => {
      // The channel's setter turns downgrade on, so downgrade comes last.
      autoUpdater.channel = channel;
      autoUpdater.allowPrerelease = allowPrerelease;
      autoUpdater.allowDowngrade = allowDowngrade;
    },
    // Both promises also reject for what the `error` event reports.
    check: async () => {
      const result = await autoUpdater.checkForUpdates().catch(() => null);

      result?.downloadPromise?.catch(() => null);
    },
    quitAndInstall: () => {
      autoUpdater.quitAndInstall();
    },
    onEvent: (listener) => {
      autoUpdater.on("checking-for-update", () => {
        listener({ kind: "checking" });
      });
      autoUpdater.on("update-available", ({ version }) => {
        listener({ kind: "available", version });
      });
      autoUpdater.on("update-not-available", () => {
        listener({ kind: "notAvailable" });
      });
      autoUpdater.on("update-downloaded", ({ version }) => {
        listener({ kind: "downloaded", version });
      });
      autoUpdater.on("error", (error) => {
        listener(
          { kind: "error", signature: isInvalidSignature(error) },
          error.message
        );
      });
    },
  };
};

/** What the end-to-end build's updater was asked, and how a test drives it. */
export interface CapturedUpdater {
  canUpdate: boolean;
  /** How many checks were started. */
  checks: number;
  channels: ChannelOptions[];
  /** When each quit-and-install was asked, by `Date.now()`. */
  installs: number[];
  /** Sends an event as the library would; one that ends a check settles it. */
  emit: (event: UpdateEvent, message?: string) => void;
}

/**
 * The end-to-end build's, which never reaches a feed: a test reads and drives
 * it on the main process's global under `meruTestUpdater`, and it can update
 * unless the launch sets `MERU_TEST_UPDATER=unsupported`. Its install records
 * the call, then ends the app without its quit, and without relaunching.
 */
export const createCapturedUpdater = (): Updater => {
  const listeners: ((event: UpdateEvent, message?: string) => void)[] = [];
  let pending: PromiseWithResolvers<void> | undefined;
  const captured: CapturedUpdater = {
    canUpdate: process.env.MERU_TEST_UPDATER !== "unsupported",
    checks: 0,
    channels: [],
    installs: [],
    emit: (event, message) => {
      for (const listener of listeners) {
        listener(event, message);
      }

      if (event.kind !== "checking" && event.kind !== "downloaded") {
        pending?.resolve();
        pending = undefined;
      }
    },
  };

  Reflect.set(globalThis, "meruTestUpdater", captured);

  return {
    canUpdate: () => captured.canUpdate,
    setChannel: (options) => {
      captured.channels.push(options);
    },
    check: () => {
      captured.checks += 1;
      pending ??= Promise.withResolvers();
      captured.emit({ kind: "checking" });

      return pending.promise;
    },
    // Ends the app at once, skipping what a quit holds for, so a test sees
    // only what was written before the install. Said on main's log first,
    // which a test reads once the app is gone, and which a pipe on macOS
    // writes asynchronously.
    quitAndInstall: () => {
      captured.installs.push(Date.now());
      process.stderr.write("meruTestUpdater: quit and install\n", () => {
        app.exit(0);
      });
    },
    onEvent: (listener) => {
      listeners.push(listener);
    },
  };
};
