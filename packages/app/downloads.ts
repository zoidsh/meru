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
      content: { page: "recent-download-history" },
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
    const openFolderWhenDone = config.get("downloads.openFolderWhenDone");

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

        if (state === "completed" && config.get("notifications.downloadCompleted")) {
          const shouldOpenFile =
            config.get("notifications.onClickDownloadCompleted") === "openFile";

          createNotification({
            title: `Downloaded: ${fileName}`,
            body: shouldOpenFile
              ? "Click to open the file"
              : `Click to show the file in ${FILE_MANAGER_NAME}`,
            click: () => {
              if (shouldOpenFile) {
                shell.openPath(filePath);
              } else {
                shell.showItemInFolder(filePath);
              }
            },
          });
        }
      });
    };

    electronDl({
      saveAs: config.get("downloads.saveAs"),
      openFolderWhenDone,
      directory: config.get("downloads.location"),
      showBadge: false,
      onStarted: openFolderWhenDone ? undefined : handleStarted,
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
