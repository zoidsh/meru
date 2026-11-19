import type { Platform } from "#core/platform.ts";
import { createDownloadSessions } from "#platform/downloads.ts";

import { createDownloads } from "../downloads.ts";
import type { Overlays } from "../overlay.ts";
import type { Profiles } from "../profiles.ts";
import type { createShellWindow } from "../shell-window.ts";
import { downloadFiles, downloadSignals } from "./test-build.ts";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Downloads from every profile's session, their history in the state, and
 * the card they are listed in. `watch` is called for each session before a
 * page of it loads.
 */
export const wireDownloads = ({
  platform,
  shell,
  profiles,
  overlays,
  newId,
}: {
  platform: Platform;
  shell: ReturnType<typeof createShellWindow>;
  profiles: Profiles;
  overlays: Overlays;
  newId: () => string;
}) => {
  const sessions = createDownloadSessions();
  const downloads = createDownloads({
    platform,
    state: profiles.get,
    commit: profiles.change,
    files: downloadFiles(),
    signals: downloadSignals(shell.window),
    overlay: {
      isOpen: () => overlays.current()?.kind === "downloads",
      open: () => {
        overlays.open({ kind: "downloads" });
      },
      close: () => {
        overlays.close();
      },
    },
    newId,
    log: console.error,
  });

  void downloads.start();
  setInterval(() => {
    void downloads.prune();
  }, DAY).unref();

  return {
    downloads,
    watch: (partition: string) => {
      sessions.watch(partition, downloads.take);
    },
  };
};
