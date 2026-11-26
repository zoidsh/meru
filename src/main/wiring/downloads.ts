import { leavesViewFree } from "#core/overlay.ts";
import type { Platform } from "#core/platform.ts";
import { profilePartition } from "#core/state.ts";
import { createDownloadSessions } from "#platform/downloads.ts";
import type { Notifier } from "#platform/notifications.ts";

import { createDownloadNotifications } from "../download-notifications.ts";
import { createDownloads } from "../downloads.ts";
import type { Focus } from "../focus.ts";
import type { Overlays } from "../overlay.ts";
import type { OwnWindows } from "../own-windows.ts";
import type { Profiles } from "../profiles.ts";
import type { SettingsStore } from "../settings.ts";
import type { createShellWindow } from "../shell-window.ts";
import { revealWindow } from "../windows.ts";
import { inOwnWindow } from "./own-windows.ts";
import { downloadFiles, downloadSignals, saveDialog } from "./test-build.ts";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Downloads from every profile's session, their history in the state, the
 * card they are listed in and the notification each that ends gives. `watch`
 * is called for each session before a page of it loads.
 */
export const wireDownloads = ({
  platform,
  isMacOS,
  background,
  shell,
  profiles,
  settings,
  overlays,
  ownWindows,
  focus,
  notifier,
  newId,
}: {
  platform: Platform;
  isMacOS: boolean;
  background: boolean;
  shell: ReturnType<typeof createShellWindow>;
  profiles: Profiles;
  settings: SettingsStore;
  overlays: Overlays;
  ownWindows: OwnWindows;
  focus: Focus;
  notifier: Notifier;
  newId: () => string;
}) => {
  const sessions = createDownloadSessions(saveDialog());
  const files = downloadFiles();
  const downloads = createDownloads({
    platform,
    state: profiles.get,
    commit: profiles.change,
    files,
    signals: downloadSignals(shell.window),
    choices: {
      folder: (profileId) => settings.get("downloadsFolder", profileId),
      saveAs: () => settings.get("downloadsSaveAs"),
      showWhenDone: () => settings.get("downloadsShowInFolder"),
    },
    // Said where the downloads show, unless a card or menu holds the overlay.
    onFolderMissing: (folder) => {
      console.error(`The downloads folder ${folder} is not usable`);

      if (leavesViewFree(overlays.current())) {
        overlays.open({ kind: "toast", message: "downloads-folder-missing" });
      }
    },
    overlay: {
      isOpen: () => overlays.current()?.kind === "downloads",
      open: () => {
        overlays.open({ kind: "downloads" });
      },
      close: () => {
        overlays.close();
      },
      webContentsId: overlays.webContentsId,
    },
    windows: {
      isOpen: ownWindows.isOpen,
      webContentsId: ownWindows.cardContentsId,
    },
    newId,
    log: console.error,
  });

  const notifications = createDownloadNotifications({
    notifier,
    isMacOS,
    quiet: background,
    quietHours: () => settings.get("quietHours"),
    doNotDisturb: () => profiles.get().doNotDisturb,
    now: () => new Date(),
    showInFolder: (id) => {
      void downloads.showInFolder(id);
    },
    showList: () => {
      // The person asked by clicking; never under the background flag.
      revealWindow(shell.window, background);
      downloads.setOpen(true);
    },
    log: console.error,
  });

  downloads.onEnded(notifications.ended);
  // In a tab's own window the card goes as the window loses the keys, as
  // the main window's does, and with the window.
  ownWindows.onBlur(downloads.closeIn);
  ownWindows.onClosed(downloads.closeIn);
  // Keys go back to the window's page or find bar only as the card is closed
  // from within it: as the window loses them, focusing its page would raise
  // it over the window just clicked where the test build focuses an inactive
  // window, as on Linux.
  downloads.onClosedIn((key) => {
    focus.focusInWindow(key, inOwnWindow(key));
  });
  void downloads.start();
  setInterval(() => {
    void downloads.prune();
  }, DAY).unref();

  return {
    downloads,
    files,
    /** `started` hears of each download after it is taken, by the webContents it began in. */
    watch: (partition: string, started: (webContentsId: number) => void) => {
      sessions.watch(partition, (item, startedIn) => {
        // A tab's own window shares its profile's session, so the session
        // names the profile wherever in it the download began.
        downloads.take(
          item,
          profiles
            .get()
            .profiles.find(({ id }) => profilePartition(id) === partition)?.id
        );
        started(startedIn);
      });
    },
  };
};
