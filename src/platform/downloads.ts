import { execFile } from "node:child_process";
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { access, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  BaseWindow,
  app,
  nativeImage,
  session,
  shell,
  webContents,
} from "electron";

import type { AppWindow } from "./window.ts";

const run = promisify(execFile);

/** How a download ended: Chromium's states, an interruption read as failed. */
export type DownloadEnd = "completed" | "cancelled" | "failed";

/** One download Chromium started, from its first moment. */
export interface DownloadItem {
  /** The name the server or page gave it. */
  fileName: string;
  mimeType: string;
  /** In milliseconds since the epoch. */
  startedAt: number;
  received: () => number;
  /** 0 while the size is not known. */
  total: () => number;
  /** Saves it there without asking; called before the item's first turn ends. */
  saveTo: (file: string) => void;
  /**
   * In place of `saveTo`, asks with the system's save dialog, opened at
   * `defaultPath`: the file chosen, or nothing once the dialog is cancelled,
   * which cancels the download.
   */
  askWhere: (defaultPath: string) => Promise<string | undefined>;
  /** Stops it; Chromium removes what it had written. */
  cancel: () => void;
  /** Once, however it ends; at once for one told after it ended. */
  onDone: (listener: (end: DownloadEnd) => void) => void;
}

/**
 * What the end-to-end build's save dialog answers, set by the test, and the
 * path it opened at each time; on the main process's global under
 * `meruTestSaveDialog`. `null` answers as Cancel does.
 */
export interface CapturedSaveDialog {
  answer: string | null;
  asked: string[];
}

/** A save dialog that answers at once, the end-to-end build's. */
export type SaveDialog = (defaultPath: string) => string | undefined;

export const createCapturedSaveDialog = (): SaveDialog => {
  const captured: CapturedSaveDialog = { answer: null, asked: [] };

  Reflect.set(globalThis, "meruTestSaveDialog", captured);

  return (defaultPath) => {
    captured.asked.push(defaultPath);

    return captured.answer ?? undefined;
  };
};

export interface DownloadSessions {
  /**
   * Hands `take` each download the partition's session starts, from any of
   * its pages, with the id of the webContents it started in. Once per
   * session; later calls change nothing.
   */
  watch: (
    partition: string,
    take: (item: DownloadItem, startedIn: number) => void
  ) => void;
}

/**
 * Asks with Chromium's own save dialog, which opens once the item's turn
 * ends; the path it was given is known from the first update after, or as it
 * ends.
 */
const askWithDialog = (item: Electron.DownloadItem, defaultPath: string) => {
  item.setSaveDialogOptions({ defaultPath });

  const { promise, resolve } = Promise.withResolvers<string | undefined>();
  const chosen = () => item.getSavePath() || undefined;

  item.on("updated", () => {
    const file = chosen();

    if (file !== undefined) {
      resolve(file);
    }
  });
  item.once("done", (_event, state) => {
    resolve(state === "cancelled" ? undefined : chosen());
  });

  return promise;
};

/** Asks the end-to-end build's dialog, which answers at once. */
const askFake = (
  item: Electron.DownloadItem,
  defaultPath: string,
  dialog: SaveDialog
) => {
  const file = dialog(defaultPath);

  if (file === undefined) {
    item.cancel();
  } else {
    item.setSavePath(file);
  }

  return Promise.resolve(file);
};

const wrap = (
  item: Electron.DownloadItem,
  saveDialog: SaveDialog | undefined
): DownloadItem => {
  const ended = new Set<(end: DownloadEnd) => void>();
  let final: DownloadEnd | undefined;
  const end = (state: DownloadEnd) => {
    if (final !== undefined) {
      return;
    }

    final = state;

    for (const listener of ended) {
      listener(state);
    }
  };

  item.on("updated", (_event, state) => {
    // Chromium may wait to resume an interrupted download; as v3, it fails
    // then, and cancelling takes the partial file away.
    if (state === "interrupted" && final === undefined) {
      end("failed");
      item.cancel();
    }
  });
  item.once("done", (_event, state) => {
    end(state === "interrupted" ? "failed" : state);
  });

  return {
    fileName: item.getFilename(),
    mimeType: item.getMimeType(),
    startedAt: Math.round(item.getStartTime() * 1000),
    received: () => item.getReceivedBytes(),
    total: () => item.getTotalBytes(),
    saveTo: (file) => {
      item.setSavePath(file);
    },
    askWhere: (defaultPath) =>
      saveDialog
        ? askFake(item, defaultPath, saveDialog)
        : askWithDialog(item, defaultPath),
    cancel: () => {
      item.cancel();
    },
    onDone: (listener) => {
      if (final === undefined) {
        ended.add(listener);
      } else {
        listener(final);
      }
    },
  };
};

/**
 * Each session's downloads; `saveDialog` in place of the system's, as the
 * end-to-end build has it.
 */
export const createDownloadSessions = (
  saveDialog?: SaveDialog
): DownloadSessions => {
  const watched = new WeakSet<Electron.Session>();

  return {
    watch: (partition, take) => {
      const watching = session.fromPartition(partition);

      if (watched.has(watching)) {
        return;
      }

      watched.add(watching);
      watching.on("will-download", (_event, item, startedIn) => {
        take(wrap(item, saveDialog), startedIn.id);
      });
    },
  };
};

/** The files downloads land in, and what a person does with one. */
export interface DownloadFiles {
  /**
   * Where downloads are saved, made if missing; at once, since Chromium
   * takes a download's path in the turn it starts.
   */
  folder: () => string;
  /**
   * Whether a folder the person chose is there and can be written, read at
   * once as `folder` is.
   */
  usable: (folder: string) => boolean;
  /** Whether something is at the path now; read as Chromium is about to write. */
  taken: (file: string) => boolean;
  exists: (file: string) => Promise<boolean>;
  /** Removes it if it is there. */
  remove: (file: string) => Promise<void>;
  /**
   * macOS alone: marks the file as downloaded, so Gatekeeper checks it when
   * opened, which Electron leaves to the app.
   */
  quarantine: (file: string, at: Date) => Promise<void>;
  /** In its default app. */
  open: (file: string) => void;
  showInFolder: (file: string) => void;
  /**
   * Starts the system's drag of the file from the web contents whose page
   * the pointer is down in, its icon the file's own.
   */
  drag: (file: string, webContentsId: number) => void;
}

const exists = async (file: string) => {
  try {
    await access(file);

    return true;
  } catch {
    return false;
  }
};

const quarantine = async (file: string, at: Date) => {
  if (process.platform !== "darwin") {
    return;
  }

  // Flags, the time in hex seconds and the agent; Meru keeps the history, so
  // no event in Launch Services' is named.
  await run("/usr/bin/xattr", [
    "-w",
    "com.apple.quarantine",
    `0081;${Math.floor(at.getTime() / 1000).toString(16)};Meru;`,
    "--",
    file,
  ]);
};

const usable = (folder: string) => {
  try {
    if (!statSync(folder).isDirectory()) {
      return false;
    }

    accessSync(folder, constants.W_OK);

    return true;
  } catch {
    return false;
  }
};

const sharedFiles = (folder: string) => ({
  folder: () => {
    mkdirSync(folder, { recursive: true });

    return folder;
  },
  usable,
  taken: existsSync,
  exists,
  remove: (file: string) => rm(file, { force: true }),
  quarantine,
});

const revealInFinder = async (file: string) => {
  try {
    await run("/usr/bin/open", ["-R", file]);
  } catch (error) {
    console.error("Could not show a download in Finder", error);
  }
};

/**
 * What the drag shows where the system has no icon for the file: a page with
 * its corner folded, 24px square. macOS refuses a drag without an icon.
 */
const FALLBACK_DRAG_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAACXBIWXMAAAsTAAALEwEAmpwYAAABFklEQVR4nN3RzysEcRjH8afd1kE5ODg4ODgoBwcHRSFEfs0f4V9x9D+478HZqCmllB+llFLYqG1mWzTM0jhY6vtWa5GDnhnPiXe9Ls/38Dl8Rf5d3j3LXoPIa8CPEpyXcOElrOQemI+JFu4gs5jVXAOzt6CpNKGcwtzH7Ya1zAPTddA8vLqWjdQx075N1TOOTESgiV/cp/KjY7J9H69l+JOxKmium+6b9cS17qNVztWBkSvQ7KeO6PnLwZN7f7vEqQPDFbAQraEzsBCtwVOwEK2BE7AQrf5jsBCtviOwEK3eQ7AQrZ49sBCt7l2wEK2uHbAQrc5tsBCtUkDUEcBvlAJCdaDos1TwCQtbkItPWNxkUR34c70BSSmcO++HIKkAAAAASUVORK5CYII=";

const dragIcon = async (file: string) => {
  try {
    const icon = await app.getFileIcon(file, { size: "normal" });

    if (!icon.isEmpty()) {
      return icon;
    }
  } catch {
    // Linux may know no icon for it.
  }

  return nativeImage.createFromDataURL(FALLBACK_DRAG_ICON);
};

const startDrag = async (file: string, webContentsId: number) => {
  const icon = await dragIcon(file);
  const from = webContents.fromId(webContentsId);

  if (from && !from.isDestroyed()) {
    from.startDrag({ file, icon });
  }
};

export const createDownloadFiles = (): DownloadFiles => ({
  ...sharedFiles(app.getPath("downloads")),
  open: (file) => {
    void shell.openPath(file);
  },
  showInFolder: (file) => {
    if (process.platform === "darwin") {
      // showItemInFolder leaves Finder behind when chosen from a notification,
      // while Meru is not the frontmost app.
      void revealInFinder(file);

      return;
    }

    shell.showItemInFolder(file);
  },
  drag: (file, webContentsId) => {
    void startDrag(file, webContentsId);
  },
});

/** What the end-to-end build would have opened, shown and dragged, in order. */
export interface CapturedDownloadFiles {
  opened: string[];
  shown: string[];
  dragged: string[];
}

/**
 * The end-to-end build's files: saved in the user data folder, never the
 * real Downloads, and opened or shown nowhere. What would have been is on
 * the main process's global under `meruTestDownloadFiles`.
 */
export const createCapturedDownloadFiles = (): DownloadFiles => {
  const captured: CapturedDownloadFiles = {
    opened: [],
    shown: [],
    dragged: [],
  };

  Reflect.set(globalThis, "meruTestDownloadFiles", captured);

  return {
    ...sharedFiles(path.join(app.getPath("userData"), "Downloads")),
    open: (file) => {
      captured.opened.push(file);
    },
    showInFolder: (file) => {
      captured.shown.push(file);
    },
    drag: (file) => {
      captured.dragged.push(file);
    },
  };
};

/** What downloads show outside the window. */
export interface DownloadSignals {
  /** On the Dock icon or taskbar button, as `AppWindow.setProgressBar` takes it. */
  progress: (progress: number | null | undefined) => void;
  /** macOS alone: bounces the Dock's Downloads stack for the file. */
  landed: (file: string) => void;
  /** Whether a window of Meru's has the focus. */
  focused: () => boolean;
}

export const createDownloadSignals = (
  window: Pick<AppWindow, "setProgressBar">
): DownloadSignals => ({
  progress: window.setProgressBar,
  landed: (file) => {
    app.dock?.downloadFinished(file);
  },
  focused: () => BaseWindow.getFocusedWindow() !== null,
});

export interface CapturedDownloadSignals {
  /** Each progress set, in order. */
  progress: (number | null | undefined)[];
  landed: string[];
}

/**
 * The end-to-end build's, which never reach the Dock or taskbar. What they
 * would have done is on the main process's global under
 * `meruTestDownloadSignals`.
 */
export const createCapturedDownloadSignals = (): DownloadSignals => {
  const captured: CapturedDownloadSignals = { progress: [], landed: [] };

  Reflect.set(globalThis, "meruTestDownloadSignals", captured);

  return {
    progress: (progress) => {
      captured.progress.push(progress);
    },
    landed: (file) => {
      captured.landed.push(file);
    },
    // The suite's app never has the focus.
    focused: () => false,
  };
};
