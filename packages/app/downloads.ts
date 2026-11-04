import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { platform } from "@electron-toolkit/utils";
import { msg, ph, t } from "@lingui/core/macro";
import { BASE_SPACING } from "@meru/shared/constants";
import { i18n } from "@meru/shared/i18n";
import { ms } from "@meru/shared/ms";
import type { DownloadItem } from "@meru/shared/types";
import { app, type BrowserWindow, dialog, type Session, shell, type WebContents } from "electron";
import { serializeError } from "serialize-error";
import { config } from "@/config";
import { main } from "@/main";
import { createNotification } from "@/notifications";
import { findUnusedPath, pathKey, withPreferredExtension } from "./lib/download-path";
import { fileExists } from "./lib/fs";
import { log } from "./lib/log";
import { Popup } from "./lib/popup";
import { quarantineFile } from "./lib/quarantine";

const FILE_NAME_PLACEHOLDER = "{fileName}";

const PENDING_SAVE_LIFETIME = ms("1m");

/** `setProgressBar` shows anything above 1 as indeterminate. */
const INDETERMINATE_PROGRESS = 2;

const NO_PROGRESS = -1;

// lingui-set comment="Button on the download notification that shows the file in the file manager"
const SHOW_IN_FILE_MANAGER = platform.isMacOS
  ? msg({ message: "Show in Finder", context: "macOS" })
  : platform.isWindows
    ? msg`Show in File Explorer`
    : msg`Show in your file manager`;
// lingui-reset

/** The address as Chromium reports it in a URL chain, or as given when it doesn't parse. */
function canonicalUrl(url: string) {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

class Downloads {
  recentDownloadHistoryPopup = new Popup();

  /** Each download that hasn't ended, with the path it was offered or given. */
  private activeDownloads = new Map<Electron.DownloadItem, string>();

  /** Keeps a finished download's share of the bar until the last one ends, so it never runs backwards. */
  private completedBytes = 0;

  /** One entry per Save Image As whose download hasn't arrived, so two of one address each ask. */
  private pendingSaves: { session: Session; url: string; expiresAt: number }[] = [];

  toggleRecentDownloadHistoryPopup(parentWindow: BrowserWindow) {
    return this.recentDownloadHistoryPopup.toggle(parentWindow, {
      page: "recent-download-history",
      width: BASE_SPACING * 48,
      height: BASE_SPACING * 44,
    });
  }

  addDownloadHistoryItem({ fileName, filePath, createdAt, exists }: Omit<DownloadItem, "id">) {
    const item = {
      id: randomUUID(),
      fileName,
      filePath,
      createdAt,
      exists,
    };

    config.set("downloads.history", [item, ...config.get("downloads.history")]);

    return item;
  }

  async markDownloadMissingIfGone(id: string, filePath: string) {
    if (await fileExists(filePath)) {
      return false;
    }

    const downloadHistory = config.get("downloads.history");

    for (const item of downloadHistory) {
      if (item.id === id) {
        item.exists = false;

        break;
      }
    }

    config.set("downloads.history", downloadHistory);

    return true;
  }

  /** Starts a download that asks where to save, whatever the Save As setting says. */
  saveAs(webContents: WebContents, url: string) {
    this.pendingSaves.push({
      session: webContents.session,
      url: canonicalUrl(url),
      expiresAt: Date.now() + PENDING_SAVE_LIFETIME,
    });

    webContents.downloadURL(url);
  }

  private takePendingSave(session: Session, item: Electron.DownloadItem) {
    const now = Date.now();

    this.pendingSaves = this.pendingSaves.filter(({ expiresAt }) => expiresAt > now);

    // The chain's first entry is the address asked for, where `getURL()` is where a redirect ended.
    const url = canonicalUrl(item.getURLChain()[0] ?? "");

    const index = this.pendingSaves.findIndex(
      (pending) => pending.session === session && pending.url === url,
    );

    if (index === -1) {
      return false;
    }

    this.pendingSaves.splice(index, 1);

    return true;
  }

  /*
   * Chromium creates a download's file moments after it starts and overwrites
   * whatever has that name, so until then the disk says a held path is free.
   */
  private isPathTaken(candidate: string) {
    const key = pathKey(candidate);

    return (
      existsSync(candidate) ||
      [...this.activeDownloads].some(
        ([item, heldPath]) => pathKey(heldPath) === key || pathKey(item.getSavePath()) === key,
      )
    );
  }

  private measureProgress() {
    // A download on its save dialog has no save path yet, and nothing to show.
    const saving = [...this.activeDownloads.keys()].filter((item) => item.getSavePath());

    if (saving.length === 0) {
      this.completedBytes = 0;

      return NO_PROGRESS;
    }

    if (saving.some((item) => item.getTotalBytes() === 0)) {
      return INDETERMINATE_PROGRESS;
    }

    let receivedBytes = this.completedBytes;
    let totalBytes = this.completedBytes;

    for (const item of saving) {
      receivedBytes += item.getReceivedBytes();
      totalBytes += item.getTotalBytes();
    }

    return receivedBytes / totalBytes;
  }

  private updateProgressBar() {
    const progress = this.measureProgress();

    const window = main.windowIfCreated;

    if (window && !window.isDestroyed()) {
      window.setProgressBar(progress);
    }
  }

  private handleFailed(item: Electron.DownloadItem) {
    if (!this.activeDownloads.delete(item)) {
      return;
    }

    this.updateProgressBar();

    const filePath = item.getSavePath();

    const fileName = filePath ? path.basename(filePath) : item.getFilename();

    this.addDownloadHistoryItem({
      fileName,
      filePath,
      createdAt: item.getStartTime(),
      exists: true,
    });

    // Later, since Chromium asserts when a download re-enters its own observer
    // notification, and the error box runs a nested message loop until dismissed.
    setTimeout(() => {
      // Takes the partial file with it. The `done` this causes finds the download already gone.
      if (item.canResume()) {
        item.cancel();
      }

      dialog.showErrorBox(
        t({
          message: "Download Error",
          comment: "Title of the error box shown when a download fails",
        }),
        // Added after Lingui, which decodes `\xHH` and `\uHHHH` in a message's
        // final text, and by a function, since a string would expand `$&`.
        t({
          message: `The download of ${ph({ fileName: FILE_NAME_PLACEHOLDER })} was interrupted`,
          comment:
            "Message of the error box shown when a download fails; fileName is the file's name",
        }).replace(FILE_NAME_PLACEHOLDER, () => fileName),
      );
    }, 0);
  }

  private async handleCompleted(item: Electron.DownloadItem) {
    const filePath = item.getSavePath();
    const fileName = path.basename(filePath);

    // Awaited first, so nothing below can lead to the file being opened
    // before it is quarantined.
    if (platform.isMacOS) {
      try {
        await quarantineFile(filePath);
      } catch (error) {
        log.error("Failed to quarantine download", { error: serializeError(error) });
      }
    }

    app.dock?.downloadFinished(filePath);

    this.addDownloadHistoryItem({
      fileName,
      filePath,
      createdAt: item.getStartTime(),
      exists: true,
    });

    if (config.get("downloads.openFolderWhenDone")) {
      shell.showItemInFolder(filePath);
    }

    if (config.get("notifications.downloadCompleted")) {
      const shouldOpenFile = config.get("notifications.onClickDownloadCompleted") === "openFile";

      const openDownload = () => {
        if (shouldOpenFile) {
          shell.openPath(filePath);
        } else if (platform.isMacOS) {
          // Meru is not the active app when the button is pressed, and
          // macOS lets only the active app bring another forward, so
          // `shell.showItemInFolder` opens a Finder window without making
          // Finder active. Launch Services' `open -R` does.
          execFile("/usr/bin/open", ["-R", filePath]);
        } else {
          shell.showItemInFolder(filePath);
        }
      };

      // On macOS, clicking a notification's body brings Meru forward, so
      // opening Finder or the file from it would put them behind Meru. An
      // action button does not, because Electron registers actions
      // without the foreground option. On Linux the body click opens the
      // download as well, because some notification servers, such as
      // dunst, draw no buttons.
      createNotification({
        // Added after Lingui, which decodes `\xHH` and `\uHHHH` in a message's
        // final text, and by a function, since a string would expand `$&`.
        title: t`Downloaded ${ph({ fileName: FILE_NAME_PLACEHOLDER })}`.replace(
          FILE_NAME_PLACEHOLDER,
          () => fileName,
        ),
        actions: [
          {
            text: shouldOpenFile
              ? t({
                  message: "Open",
                  comment: "Button on the download notification that opens the file",
                })
              : i18n.t(SHOW_IN_FILE_MANAGER),
            type: "button",
          },
        ],
        action: openDownload,
        click: platform.isLinux ? openDownload : undefined,
      });
    }
  }

  init() {
    // Settings shows a restart prompt for these two, so they're read once.
    const alwaysAsk = config.get("downloads.saveAs");
    const directory = config.get("downloads.location");

    const handleWillDownload = (session: Session, item: Electron.DownloadItem) => {
      const isPendingSave = this.takePendingSave(session, item);

      const unusedPath = findUnusedPath(
        path.join(
          isPendingSave ? config.get("downloads.location") : directory,
          withPreferredExtension(item.getFilename(), item.getMimeType()),
        ),
        (candidate) => this.isPathTaken(candidate),
      );

      this.activeDownloads.set(item, unusedPath);

      if (isPendingSave || alwaysAsk) {
        item.setSaveDialogOptions({ defaultPath: unusedPath });
      } else {
        item.setSavePath(unusedPath);
      }

      item.on("updated", (_updatedEvent, state) => {
        if (state === "interrupted") {
          this.handleFailed(item);
        } else {
          this.updateProgressBar();
        }
      });

      item.once("done", (_doneEvent, state) => {
        if (state === "interrupted") {
          this.handleFailed(item);

          return;
        }

        if (!this.activeDownloads.delete(item)) {
          return;
        }

        if (state === "completed") {
          this.completedBytes += item.getReceivedBytes();
        }

        this.updateProgressBar();

        if (state === "completed") {
          this.handleCompleted(item);
        }
      });
    };

    app.on("session-created", (session) => {
      session.on("will-download", (_event, item) => {
        handleWillDownload(session, item);
      });
    });

    const cleanupDownloadsHistory = () => {
      const history = config.get("downloads.history");

      const now = Date.now();

      const cleanedUpHistory = history.filter((item) => now - item.createdAt * 1000 < ms("30d"));

      if (cleanedUpHistory.length !== history.length) {
        config.set("downloads.history", cleanedUpHistory);
      }
    };

    cleanupDownloadsHistory();

    setInterval(cleanupDownloadsHistory, ms("24h"));
  }

  async checkDownloadHistoryItems(limit?: number) {
    const downloadHistory = config.get("downloads.history");

    await Promise.all(
      (limit ? downloadHistory.slice(0, limit) : downloadHistory).map(
        async ({ filePath }, index) => {
          const item = downloadHistory[index];

          if (item) {
            item.exists = await fileExists(filePath);
          }
        },
      ),
    );

    config.set("downloads.history", downloadHistory);
  }
}

export const downloads = new Downloads();
