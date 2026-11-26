import {
  INITIAL_UPDATE_STATUS,
  RELEASES_URL,
  UPDATE_CHECK_INTERVAL,
  channelOptions,
  nextUpdateStatus,
  releasePageUrl,
} from "#core/updates.ts";
import type { UpdateStatus } from "#core/updates.ts";
import type { Updater } from "#platform/updater.ts";

import type { SettingsStore } from "./settings.ts";

/**
 * How long the app may keep running once the install is asked for before
 * Meru finishes the quit itself. On macOS the library says a download is
 * ready before Squirrel.Mac has fetched it from the library's local server,
 * and its install waits for Squirrel, which may still be fetching or may
 * have failed with nothing said: without this the app would stay running
 * with its windows closed.
 */
export const INSTALL_QUIT_CAP = 15_000;

const UNSUPPORTED: UpdateStatus = {
  status: "unsupported",
  version: null,
  lastChecked: null,
};

/**
 * An error's message as a log may keep it: no URL's query or fragment, where
 * a feed's tokens go, and no home folder, which names the person.
 */
export const loggableUpdateError = (message: string, home: string) => {
  const withoutQueries = message.replaceAll(
    /(?<url>https?:\/\/[^\s?#]+)[?#]\S*/gu,
    "$<url>"
  );

  return home === "" ? withoutQueries : withoutQueries.replaceAll(home, "~");
};

/**
 * Checks for a new version at launch and every three hours while the setting
 * is on, applies the channel as it changes, and holds where updating stands
 * for the About page. With no updater, or one that cannot update this
 * install, it stays `unsupported` and never asks the updater anything.
 */
export const createUpdates = ({
  updater,
  settings,
  runningVersion,
  quitThen,
  quit,
  openExternal,
  home,
  now,
  log,
}: {
  updater: Updater | undefined;
  settings: Pick<SettingsStore, "get" | "onChange">;
  runningVersion: string;
  /** Quits as Quit does, then calls `finish` in place of the last quit. */
  quitThen: (finish: () => void) => void;
  quit: () => void;
  /** Meru's own links' browser, which asks nothing. */
  openExternal: (url: string) => Promise<void> | void;
  home: string;
  now: () => number;
  log: (message: string) => void;
}) => {
  const supported = updater?.canUpdate() === true ? updater : undefined;
  const listeners = new Set<() => void>();
  let current = supported ? INITIAL_UPDATE_STATUS : UNSUPPORTED;
  let available: string | null = null;
  let checking: Promise<void> | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  let started = false;
  let installing = false;
  let installCap: ReturnType<typeof setTimeout> | undefined;

  // Finishes the quit begun for an install that is not quitting the app.
  const finishQuit = () => {
    clearTimeout(installCap);
    installing = false;
    quit();
  };

  const set = (next: UpdateStatus) => {
    if (
      next.status === current.status &&
      next.version === current.version &&
      next.lastChecked === current.lastChecked
    ) {
      return;
    }

    current = next;

    for (const listener of listeners) {
      listener();
    }
  };

  const check = () => {
    if (!supported || checking) {
      return;
    }

    checking = supported.check().finally(() => {
      checking = undefined;
    });
  };

  const applyChannel = () => {
    supported?.setChannel(
      channelOptions(settings.get("updateChannel"), runningVersion)
    );
  };

  const follow = () => {
    clearInterval(interval);
    interval = undefined;

    if (!started || !settings.get("autoUpdate")) {
      return;
    }

    check();
    interval = setInterval(check, UPDATE_CHECK_INTERVAL);
  };

  if (supported) {
    applyChannel();
    supported.onEvent((event, message) => {
      if (event.kind === "error") {
        log(
          `Update ${event.signature ? "not verified" : "failed"}: ${loggableUpdateError(message ?? "", home)}`
        );

        // Nothing was there to install.
        if (installing) {
          finishQuit();
        }
      }

      if (event.kind === "available") {
        available = event.version;
      }

      set(nextUpdateStatus(current, event, { now: now(), available }));
    });
    settings.onChange("autoUpdate", follow);
    settings.onChange("updateChannel", () => {
      applyChannel();
      check();
    });
  }

  return {
    read: () => current,
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
    /** Once the window shows: the launch's check and the interval after it. */
    start: () => {
      started = true;
      follow();
    },
    check,
    /**
     * Saves what quit saves, then installs; nothing without a download. A
     * second press while the quit is held is `quitThen`'s to ignore.
     */
    restart: () => {
      if (!supported || current.status !== "ready") {
        return;
      }

      quitThen(() => {
        installing = true;
        installCap = setTimeout(finishQuit, INSTALL_QUIT_CAP);
        supported.quitAndInstall();
      });
    },
    /** The release page of the version that could not be verified. */
    openRelease: () => {
      if (current.status === "unverified" && current.version !== null) {
        void openExternal(releasePageUrl(current.version));
      }
    },
    /** What changed: a version's release page, or with none every release. */
    openWhatsNew: (version: string | null) => {
      void openExternal(
        version === null ? RELEASES_URL : releasePageUrl(version)
      );
    },
    /** As the app quits, the install's own quit included. */
    dispose: () => {
      clearInterval(interval);
      clearTimeout(installCap);
    },
  };
};

export type Updates = ReturnType<typeof createUpdates>;
