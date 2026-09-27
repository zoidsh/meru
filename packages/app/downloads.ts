import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { platform } from "@electron-toolkit/utils";
import { BASE_SPACING } from "@meru/shared/constants";
import { ms } from "@meru/shared/ms";
import type { DownloadItem } from "@meru/shared/types";
import { type BrowserWindow, shell } from "electron";
import electronDl from "electron-dl";
import { config } from "@/config";
import { createNotification } from "@/notifications";
import { fileExists } from "./lib/fs";
import { Popup } from "./lib/popup";

const FILE_MANAGER_NAME = platform.isMacOS
  ? "Finder"
  : platform.isWindows
    ? "File Explorer"
    : "your file manager";

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
      item.once("done", (_, state) => {
        const filePath = item.getSavePath();
        const fileName = path.basename(filePath);

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

          // Clicking a notification's body brings Meru forward, so opening
          // Finder or the file from it would put them behind Meru. An action
          // button does not bring Meru forward, because Electron registers
          // actions without the foreground option. Linux has no action
          // buttons, so there the body click opens the download.
          const hasActionButton = !platform.isLinux;

          createNotification({
            title: `Downloaded ${fileName}`,
            body: hasActionButton
              ? undefined
              : shouldOpenFile
                ? "Click to open the file."
                : `Click to show the file in ${FILE_MANAGER_NAME}.`,
            actions: hasActionButton
              ? [
                  {
                    text: shouldOpenFile ? "Open" : `Show in ${FILE_MANAGER_NAME}`,
                    type: "button",
                  },
                ]
              : undefined,
            action: hasActionButton ? openDownload : undefined,
            click: hasActionButton ? undefined : openDownload,
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
