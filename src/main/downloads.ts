import path from "node:path";

import type { ShellState } from "#contract/shell.ts";
import {
  addDownload,
  clearable,
  downloads as historyOf,
  expired,
  nameKey,
  removeDownloads,
  settledAtStart,
  totalProgress,
  unusedName,
  updateDownload,
  withExtension,
} from "#core/downloads.ts";
import type { DownloadEntry } from "#core/downloads.ts";
import type { Platform } from "#core/platform.ts";
import type { State } from "#core/state.ts";
import type {
  DownloadEnd,
  DownloadFiles,
  DownloadItem,
  DownloadSignals,
} from "#platform/downloads.ts";

export interface DownloadsDeps {
  platform: Platform;
  /** Main's state, which holds the history. */
  state: () => State;
  /** Saves a change of the history; one at a time, in order. */
  commit: (change: (state: State) => State | undefined) => Promise<unknown>;
  files: DownloadFiles;
  signals: DownloadSignals;
  /** The overlay it shows in, which keeps whether it is open. */
  overlay: {
    isOpen: () => boolean;
    open: () => void;
    close: () => void;
  };
  newId: () => string;
  now?: () => number;
  /** Runs `run` again and again until the returned function stops it. */
  repeat?: (run: () => void) => () => void;
  log: (message: string) => void;
}

type ShellDownloads = ShellState["downloads"];

interface Running {
  item: DownloadItem;
  path: string;
}

/** How often the progress shown is read again while anything runs. */
export const PROGRESS_INTERVAL = 500;

const repeatEvery = (run: () => void) => {
  const timer = setInterval(run, PROGRESS_INTERVAL);

  return () => {
    clearInterval(timer);
  };
};

/** The name a site gave, never a path out of the folder. */
const safeName = (fileName: string) => {
  const name = path.basename(fileName);

  return name === "" || name === "." || name === ".." ? "download" : name;
};

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Every download of every profile: saved in the downloads folder under a
 * name nothing has, shown while it runs, and listed for 30 days. The
 * titlebar's button fills with the total while anything runs, and is green
 * once one finished until the card is opened.
 */
export const createDownloads = ({
  platform,
  state,
  commit,
  files,
  signals,
  overlay,
  newId,
  now = Date.now,
  repeat = repeatEvery,
  log,
}: DownloadsDeps) => {
  const listeners = new Set<() => void>();
  const running = new Map<string, Running>();
  /** Finished entries whose file was not there when last looked for. */
  const gone = new Set<string>();
  /** Bytes of those that finished since nothing last ran. */
  let finishedBytes = 0;
  let unseen = false;
  let stopRepeating: (() => void) | undefined;

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const save = async (change: (current: State) => State | undefined) => {
    try {
      await commit(change);
    } catch (error) {
      log(`The downloads were not saved: ${describe(error)}`);
    }
  };

  const progress = () =>
    totalProgress(
      [...running.values()].map(({ item }) => ({
        received: item.received(),
        total: item.total(),
      })),
      finishedBytes
    );

  let shown: number | null | undefined;

  const showProgress = () => {
    const share = progress();

    if (share !== shown) {
      shown = share;
      signals.progress(share);
    }
  };

  // Read on a beat rather than on Chromium's progress events, which leave
  // bytes that arrived before the item was taken untold until more come.
  const refresh = () => {
    showProgress();
    notify();
  };

  const watchRunning = () => {
    if (running.size > 0) {
      stopRepeating ??= repeat(refresh);
    } else {
      stopRepeating?.();
      stopRepeating = undefined;
    }
  };

  const pathTaken = (folder: string) => {
    const held = new Set(
      [...running.values()].map((each) =>
        nameKey(path.basename(each.path), platform)
      )
    );

    return (fileName: string) =>
      held.has(nameKey(fileName, platform)) ||
      files.taken(path.join(folder, fileName));
  };

  const ended = async (
    id: string,
    item: DownloadItem,
    filePath: string,
    end: DownloadEnd
  ) => {
    running.delete(id);

    if (end === "completed") {
      finishedBytes += item.received();
    }

    if (running.size === 0) {
      finishedBytes = 0;
    }

    watchRunning();
    showProgress();

    if (end === "completed") {
      // Before anything can open it.
      await files
        .quarantine(filePath, new Date(now()))
        .catch((error: unknown) => {
          log(`A download was not quarantined: ${describe(error)}`);
        });

      // The Dock tells nothing a window in front already shows.
      if (!signals.focused()) {
        signals.landed(filePath);
      }

      if (!overlay.isOpen()) {
        unseen = true;
      }
    } else {
      // Chromium removes its partial file; this covers one it left.
      await files.remove(filePath).catch((error: unknown) => {
        log(`A stopped download's file was not removed: ${describe(error)}`);
      });
    }

    await save((current) =>
      updateDownload(current, id, {
        state: end,
        size: end === "completed" ? item.received() : item.total(),
      })
    );
    notify();
  };

  /**
   * Names and saves a download as its session starts it, at once, since
   * Chromium asks where to save it once the item's turn ends.
   */
  const take = (item: DownloadItem) => {
    const id = newId();
    const folder = files.folder();
    const fileName = unusedName(
      withExtension(safeName(item.fileName), item.mimeType),
      pathTaken(folder)
    );
    const filePath = path.join(folder, fileName);

    item.saveTo(filePath);
    running.set(id, { item, path: filePath });
    watchRunning();
    item.onDone((end) => {
      void ended(id, item, filePath, end);
    });

    const entry: DownloadEntry = {
      id,
      fileName,
      path: filePath,
      size: item.total(),
      startedAt: item.startedAt || now(),
      state: "progressing",
    };

    void save((current) => addDownload(current, entry));
    showProgress();
    notify();
  };

  const listed = () => historyOf(state());

  const finished = (id: string) =>
    listed().find((entry) => entry.id === id && entry.state === "completed");

  /** Notes whether each finished file is still where it landed. */
  const checkFiles = async () => {
    const results = await Promise.all(
      listed()
        .filter((entry) => entry.state === "completed")
        .map(async (entry) => ({
          id: entry.id,
          there: await files.exists(entry.path),
        }))
    );
    let changed = false;

    for (const { id, there } of results) {
      if (there === gone.has(id)) {
        changed = true;

        if (there) {
          gone.delete(id);
        } else {
          gone.add(id);
        }
      }
    }

    if (changed) {
      notify();
    }
  };

  const prune = () =>
    save((current) =>
      removeDownloads(current, (entry) => expired(entry, now()))
    );

  const isOpen = () => overlay.isOpen();

  const setOpen = (open: boolean) => {
    if (open === isOpen()) {
      return;
    }

    if (open) {
      unseen = false;
      overlay.open();
      void checkFiles();
    } else {
      overlay.close();
    }

    notify();
  };

  const rowState = (
    entry: DownloadEntry
  ): ShellDownloads["rows"][number]["state"] => {
    if (entry.state === "completed" && gone.has(entry.id)) {
      return "gone";
    }

    if (entry.state === "progressing" && running.has(entry.id)) {
      return "progressing";
    }

    // Running when this build started, which cancelled it at quit.
    return entry.state === "progressing" ? "cancelled" : entry.state;
  };

  const shellSlice = (): ShellDownloads => {
    const share = progress();
    const button: ShellDownloads["button"] =
      share === undefined
        ? { kind: unseen ? "finished" : "plain" }
        : { kind: "running", progress: share };

    if (!isOpen()) {
      return { open: false, button, rows: [] };
    }

    return {
      open: true,
      button,
      rows: listed().map((entry) => {
        const live = running.get(entry.id)?.item;

        return {
          id: entry.id,
          fileName: entry.fileName,
          state: rowState(entry),
          received: live?.received() ?? 0,
          total: live?.total() ?? entry.size,
          startedAt: entry.startedAt,
        };
      }),
    };
  };

  return {
    /**
     * At startup: those running at the last quit are listed as cancelled,
     * and those past 30 days go.
     */
    start: async () => {
      await save((current) => settledAtStart(current, (id) => running.has(id)));
      await prune();
    },
    take,
    prune,
    isOpen,
    setOpen,
    shellSlice,
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
    /** In its default app, closing the card; a file gone is marked so. */
    openFile: async (id: string) => {
      const entry = finished(id);

      if (!entry) {
        return;
      }

      if (await files.exists(entry.path)) {
        gone.delete(id);
        files.open(entry.path);
        setOpen(false);
      } else {
        gone.add(id);
        notify();
      }
    },
    showInFolder: async (id: string) => {
      const entry = finished(id);

      if (!entry) {
        return;
      }

      if (await files.exists(entry.path)) {
        files.showInFolder(entry.path);
      } else {
        gone.add(id);
        notify();
      }
    },
    cancel: (id: string) => {
      running.get(id)?.item.cancel();
    },
    /** Takes the entry off the list; a running download is not. */
    remove: async (id: string) => {
      await save((current) =>
        removeDownloads(current, (entry) => entry.id === id && clearable(entry))
      );
      gone.delete(id);
      notify();
    },
    /** Takes off every entry but those running. */
    clear: async () => {
      await save((current) =>
        removeDownloads(
          current,
          (entry) => clearable(entry) && !running.has(entry.id)
        )
      );
      gone.clear();
      notify();
    },
  };
};

export type Downloads = ReturnType<typeof createDownloads>;
