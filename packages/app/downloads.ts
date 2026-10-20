import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { platform } from "@electron-toolkit/utils";
import { msg, t } from "@lingui/core/macro";
import { BASE_SPACING } from "@meru/shared/constants";
import { i18n } from "@meru/shared/i18n";
import { ms } from "@meru/shared/ms";
import type { DownloadItem } from "@meru/shared/types";
import { type BrowserWindow, shell } from "electron";
import electronDl from "electron-dl";
import { serializeError } from "serialize-error";
import { config } from "@/config";
import { createNotification } from "@/notifications";
import { fileExists } from "./lib/fs";
import { log } from "./lib/log";
import { Popup } from "./lib/popup";
import { quarantineFile } from "./lib/quarantine";

// lingui-set comment="Button on the download notification that shows the file in the file manager"
const SHOW_IN_FILE_MANAGER = platform.isMacOS
  ? msg`Show in Finder`
  : platform.isWindows
    ? msg`Show in File Explorer`
    : msg`Show in your file manager`;
// lingui-reset

class Downloads {
  recentDownloadHistoryPopup = new Popup();

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

  init() {
    const handleStarted = (item: Electron.DownloadItem) => {
      item.once("done", async (_, state) => {
        const filePath = item.getSavePath();
        const fileName = path.basename(filePath);

        // Awaited first, so nothing below can lead to the file being opened
        // before it is quarantined.
        if (state === "completed" && platform.isMacOS) {
          try {
            await quarantineFile(filePath);
          } catch (error) {
            log.error("Failed to quarantine download", { error: serializeError(error) });
          }
        }

        this.addDownloadHistoryItem({
          fileName,
          filePath,
          createdAt: item.getStartTime(),
          exists: true,
        });

        if (state !== "completed") {
          return;
        }

        if (config.get("downloads.openFolderWhenDone")) {
          shell.showItemInFolder(filePath);
        }

        if (config.get("notifications.downloadCompleted")) {
          const shouldOpenFile =
            config.get("notifications.onClickDownloadCompleted") === "openFile";

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
            title: t`Downloaded ${fileName}`,
            actions: [
              {
                text: shouldOpenFile
                  ? t({
                      message: "Open",
                      comment: "Button on the download notification that opens the file",
                    })
                  : i18n._(SHOW_IN_FILE_MANAGER),
                type: "button",
              },
            ],
            action: openDownload,
            click: platform.isLinux ? openDownload : undefined,
          });
        }
      });
    };

    // `openFolderWhenDone` is handled above rather than by electron-dl, which
    // reads the option once when the listener is registered.
    electronDl({
      saveAs: config.get("downloads.saveAs"),
      directory: config.get("downloads.location"),
      showBadge: false,
      onStarted: handleStarted,
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
