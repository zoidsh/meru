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
import { tabKey } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import type {
  DownloadEnd,
  DownloadFiles,
  DownloadItem,
  DownloadSignals,
} from "#platform/downloads.ts";

/** A download as it ended, under the name it was saved as. */
export interface EndedDownload {
  id: string;
  fileName: string;
  end: DownloadEnd;
}

export interface DownloadsDeps {
  platform: Platform;
  /** Main's state, which holds the history. */
  state: () => State;
  /** Saves a change of the history; one at a time, in order. */
  commit: (change: (state: State) => State | undefined) => Promise<unknown>;
  files: DownloadFiles;
  signals: DownloadSignals;
  /** What the person chose in Settings, read as each download starts. */
  choices: {
    /** The folder they chose, `null` for the system's. */
    folder: () => string | null;
    /** Whether each download asks where to save it. */
    saveAs: () => boolean;
    /** Whether each finished download is shown in its folder. */
    showWhenDone: () => boolean;
  };
  /**
   * Told once a run of each chosen folder that was not there or could not be
   * written, a download having gone to the system's folder instead.
   */
  onFolderMissing: (folder: string) => void;
  /** The main window's overlay it shows in there, which keeps whether it is open. */
  overlay: {
    isOpen: () => boolean;
    open: () => void;
    close: () => void;
    /** The web contents of the overlay's document, if any. */
    webContentsId: () => number | undefined;
  };
  /** The tabs' own windows, each of which shows it in a document of its own. */
  windows: {
    isOpen: (key: TabKey) => boolean;
    /** The web contents of the window's card document, once it is there. */
    webContentsId: (key: TabKey) => number | undefined;
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
  choices,
  onFolderMissing,
  overlay,
  windows,
  newId,
  now = Date.now,
  repeat = repeatEvery,
  log,
}: DownloadsDeps) => {
  const listeners = new Set<() => void>();
  const endListeners = new Set<(ended: EndedDownload) => void>();
  const closedInListeners = new Set<(window: TabKey) => void>();
  const running = new Map<string, Running>();
  /** Finished entries whose file was not there when last looked for. */
  const gone = new Set<string>();
  /** The tab whose own window shows the card, while it is open there. */
  let inWindow: TabKey | undefined;
  /** The chosen folders found missing, each told of once. */
  const missing = new Set<string>();
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
      [...running.values()].map((each) => nameKey(each.path, platform))
    );

    return (fileName: string) =>
      held.has(nameKey(path.join(folder, fileName), platform)) ||
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

      if (choices.showWhenDone()) {
        files.showInFolder(filePath);
      }

      if (!isOpen()) {
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

    for (const listener of endListeners) {
      listener({ id, fileName: path.basename(filePath), end });
    }
  };

  /**
   * The chosen folder where it can take the file, else the system's, the
   * chosen one left as stored for when it is back. `announce` tells of the
   * fallback, for a download saved there rather than one the save dialog
   * only starts at.
   */
  const saveFolder = (announce: boolean) => {
    const chosen = choices.folder();

    if (chosen === null || files.usable(chosen)) {
      return chosen ?? files.folder();
    }

    if (announce && !missing.has(chosen)) {
      missing.add(chosen);
      onFolderMissing(chosen);
    }

    return files.folder();
  };

  /** Runs and lists the download, saving to `filePath`. */
  const start = (item: DownloadItem, filePath: string) => {
    const id = newId();
    const fileName = path.basename(filePath);

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

  const askWhere = async (item: DownloadItem, offered: string) => {
    const chosen = await item.askWhere(offered);

    if (chosen !== undefined) {
      start(item, chosen);
    }
  };

  /**
   * Names and saves a download as its session starts it, at once, since
   * Chromium asks where to save it once the item's turn ends; or, where
   * each download asks, offers that name in the save dialog, a cancel
   * leaving nothing listed.
   */
  const take = (item: DownloadItem) => {
    const asks = choices.saveAs();
    const folder = saveFolder(!asks);
    const filePath = path.join(
      folder,
      unusedName(
        withExtension(safeName(item.fileName), item.mimeType),
        pathTaken(folder)
      )
    );

    if (!asks) {
      item.saveTo(filePath);
      start(item, filePath);

      return;
    }

    void askWhere(item, filePath);
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

  const isOpen = () => inWindow !== undefined || overlay.isOpen();

  const isOpenIn = (window: TabKey | undefined) =>
    window === undefined
      ? inWindow === undefined && overlay.isOpen()
      : inWindow !== undefined && tabKey(inWindow) === tabKey(window);

  /**
   * Closes it wherever it is; `fromWithin` when that was asked in its window,
   * not by the window losing the keys or going.
   */
  const close = (fromWithin: boolean) => {
    const was = inWindow;

    if (was !== undefined) {
      inWindow = undefined;
    } else if (overlay.isOpen()) {
      overlay.close();
    } else {
      return;
    }

    notify();

    if (was !== undefined && fromWithin) {
      for (const listener of closedInListeners) {
        listener(was);
      }
    }
  };

  /**
   * Opens it in the main window, or in the tab's own window `window` names,
   * from wherever it was, there being one card; or closes it wherever it is.
   * Opening it anywhere counts a finished download as seen.
   */
  const setOpen = (open: boolean, window?: TabKey) => {
    if (!open) {
      close(true);

      return;
    }

    if (isOpenIn(window) || (window && !windows.isOpen(window))) {
      return;
    }

    unseen = false;

    if (window) {
      if (overlay.isOpen()) {
        overlay.close();
      }

      inWindow = window;
    } else {
      inWindow = undefined;
      overlay.open();
    }

    void checkFiles();
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
      return { open: false, window: null, button, rows: [] };
    }

    return {
      open: true,
      window: inWindow ?? null,
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
    /** The tab whose own window shows the card, while it is open there. */
    window: () => inWindow,
    /** Closes it if the tab's own window shows it, as that window goes or loses the keys. */
    closeIn: (window: TabKey) => {
      if (isOpenIn(window)) {
        close(false);
      }
    },
    /** Told of the tab whose own window the card was closed in from within. */
    onClosedIn: (listener: (window: TabKey) => void) => {
      closedInListeners.add(listener);
    },
    shellSlice,
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
    /** Told of each download as it finishes, fails or is cancelled. */
    onEnded: (listener: (ended: EndedDownload) => void) => {
      endListeners.add(listener);
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
    /**
     * Drags the finished file from the card's document, the row's own drag
     * having been cancelled for it; a file gone is marked so. Its presence is
     * read at once, as the pointer is still down.
     */
    drag: (id: string) => {
      const entry = finished(id);
      const from = inWindow
        ? windows.webContentsId(inWindow)
        : overlay.webContentsId();

      if (!entry || from === undefined) {
        return;
      }

      if (files.taken(entry.path)) {
        gone.delete(id);
        files.drag(entry.path, from);
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
