import { randomUUID } from "node:crypto";
import path from "node:path";
import { platform } from "@electron-toolkit/utils";
import { ms } from "@meru/shared/ms";
import type { DownloadItem } from "@meru/shared/types";
import { BrowserWindow, shell, WebContentsView } from "electron";
import electronDl from "electron-dl";
import { config } from "@/config";
import { createNotification } from "@/notifications";
import { APP_TITLEBAR_HEIGHT, BASE_SPACING } from "@meru/shared/constants";
import { fileExists } from "./lib/fs";
import { getPreloadPath, loadRenderer } from "./lib/window";

const FILE_MANAGER_NAME = platform.isMacOS
  ? "Finder"
  : platform.isWindows
    ? "File Explorer"
    : "your file manager";

class Downloads {
  recentDownloadHistoryView: WebContentsView | null = null;

  recentDownloadHistoryParentWindow: BrowserWindow | null = null;

  downloadHistoryPopupOnBlurEnabled = false;

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
          createNotification({
            title: `Downloaded: ${fileName}`,
            body: `Click to show the file in ${FILE_MANAGER_NAME}`,
            click: () => {
              shell.showItemInFolder(filePath);
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

  setRecentDownloadHistoryPopupBounds = () => {
    if (!this.recentDownloadHistoryView || !this.recentDownloadHistoryParentWindow) {
      return;
    }

    const width = BASE_SPACING * 48;

    const parentBounds = platform.isWindows
      ? this.recentDownloadHistoryParentWindow.getContentBounds()
      : this.recentDownloadHistoryParentWindow.getBounds();

    this.recentDownloadHistoryView.setBounds({
      x: parentBounds.width - width - BASE_SPACING,
      y: APP_TITLEBAR_HEIGHT + BASE_SPACING,
      width,
      height: BASE_SPACING * 44,
    });
  };

  closeRecentDownloadHistoryPopup = () => {
    if (this.recentDownloadHistoryView && this.recentDownloadHistoryParentWindow) {
      this.recentDownloadHistoryView.webContents.removeAllListeners();

      this.recentDownloadHistoryView.webContents.close();

      this.recentDownloadHistoryParentWindow.contentView.removeChildView(
        this.recentDownloadHistoryView,
      );

      this.recentDownloadHistoryParentWindow.removeListener(
        "resize",
        this.setRecentDownloadHistoryPopupBounds,
      );

      this.recentDownloadHistoryView = null;
      this.recentDownloadHistoryParentWindow = null;
    }
  };

  toggleRecentDownloadHistoryPopup(parentWindow: BrowserWindow) {
    if (this.recentDownloadHistoryView) {
      const wasSameWindow = this.recentDownloadHistoryParentWindow === parentWindow;

      this.closeRecentDownloadHistoryPopup();

      if (wasSameWindow) {
        return false;
      }
    }

    this.recentDownloadHistoryView = new WebContentsView({
      webPreferences: {
        preload: getPreloadPath("renderer"),
      },
    });

    this.recentDownloadHistoryParentWindow = parentWindow;

    loadRenderer(this.recentDownloadHistoryView, {
      renderer: "popup",
      port: 3001,
      hash: "recent-download-history",
    });

    parentWindow.contentView.addChildView(this.recentDownloadHistoryView);

    this.setRecentDownloadHistoryPopupBounds();

    this.recentDownloadHistoryView.webContents.once("blur", () => {
      if (this.downloadHistoryPopupOnBlurEnabled) {
        this.closeRecentDownloadHistoryPopup();
      }
    });

    parentWindow.on("resize", this.setRecentDownloadHistoryPopupBounds);

    this.recentDownloadHistoryView.setBorderRadius(BASE_SPACING * 2);

    return true;
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
