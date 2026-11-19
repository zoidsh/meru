import { execFile } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { access, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { BaseWindow, app, session, shell } from "electron";

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
  /** Stops it; Chromium removes what it had written. */
  cancel: () => void;
  /** Once, however it ends. */
  onDone: (listener: (end: DownloadEnd) => void) => void;
}

export interface DownloadSessions {
  /**
   * Hands `take` each download the partition's session starts, from any of
   * its pages. Once per session; later calls change nothing.
   */
  watch: (partition: string, take: (item: DownloadItem) => void) => void;
}

const wrap = (item: Electron.DownloadItem): DownloadItem => {
  const ended = new Set<(end: DownloadEnd) => void>();
  let over = false;
  const end = (state: DownloadEnd) => {
    if (over) {
      return;
    }

    over = true;

    for (const listener of ended) {
      listener(state);
    }
  };

  item.on("updated", (_event, state) => {
    // Chromium may wait to resume an interrupted download; as v3, it fails
    // then, and cancelling takes the partial file away.
    if (state === "interrupted" && !over) {
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
    cancel: () => {
      item.cancel();
    },
    onDone: (listener) => {
      ended.add(listener);
    },
  };
};

export const createDownloadSessions = (): DownloadSessions => {
  const watched = new WeakSet<Electron.Session>();

  return {
    watch: (partition, take) => {
      const watching = session.fromPartition(partition);

      if (watched.has(watching)) {
        return;
      }

      watched.add(watching);
      watching.on("will-download", (_event, item) => {
        take(wrap(item));
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

const sharedFiles = (folder: string) => ({
  folder: () => {
    mkdirSync(folder, { recursive: true });

    return folder;
  },
  taken: existsSync,
  exists,
  remove: (file: string) => rm(file, { force: true }),
  quarantine,
});

export const createDownloadFiles = (): DownloadFiles => ({
  ...sharedFiles(app.getPath("downloads")),
  open: (file) => {
    void shell.openPath(file);
  },
  showInFolder: (file) => {
    shell.showItemInFolder(file);
  },
});

/** What the end-to-end build would have opened, in order. */
export interface CapturedDownloadFiles {
  opened: string[];
  shown: string[];
}

/**
 * The end-to-end build's files: saved in the user data folder, never the
 * real Downloads, and opened or shown nowhere. What would have been is on
 * the main process's global under `meruTestDownloadFiles`.
 */
export const createCapturedDownloadFiles = (): DownloadFiles => {
  const captured: CapturedDownloadFiles = { opened: [], shown: [] };

  Reflect.set(globalThis, "meruTestDownloadFiles", captured);

  return {
    ...sharedFiles(path.join(app.getPath("userData"), "Downloads")),
    open: (file) => {
      captured.opened.push(file);
    },
    showInFolder: (file) => {
      captured.shown.push(file);
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
