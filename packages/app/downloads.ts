import { randomUUID } from "node:crypto";
import path from "node:path";
import { ms } from "@meru/shared/ms";
import type { DownloadItem } from "@meru/shared/types";
import { shell } from "electron";
import electronDl from "electron-dl";
import { config } from "@/config";
import { createNotification } from "@/notifications";
import { ipc } from "./ipc";
import { main } from "./main";

class Downloads {
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

  init() {
    const openFolderWhenDone = config.get("downloads.openFolderWhenDone");

    const handleStarted = (item: Electron.DownloadItem) => {
      item.once("done", (_, state) => {
        const filePath = item.getSavePath();
        const fileName = path.basename(filePath);

        const { id } = this.addDownloadHistoryItem({
          fileName,
          filePath,
          createdAt: item.getStartTime(),
          exists: true,
        });

        ipc.renderer.send(main.window.webContents, "downloads.itemCompleted", id);

        if (config.get("notifications.downloadCompleted")) {
          createNotification({
            title: `Download ${state}`,
            body: fileName,
            click: () => {
              shell.openPath(filePath);
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
}

export const downloads = new Downloads();
