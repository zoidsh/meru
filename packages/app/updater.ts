import { is } from "@electron-toolkit/utils";
import { ms } from "@meru/shared/ms";
import type { UpdateDownloadedEvent } from "electron-updater";
import { autoUpdater } from "electron-updater";
import { config } from "@/config";
import { ipc } from "./ipc";
import { log } from "./lib/log";
import { main } from "./main";
import { appState } from "./state";

const URGENT_MARKERS = ["<!-- urgent -->", "[urgent]"];

const NOTIFICATION_DELAY_MS = {
  immediate: 0,
  "few-hours": ms("4h"),
  "next-day": ms("1d"),
} as const;

type ReleaseNotes = UpdateDownloadedEvent["releaseNotes"];

function flattenReleaseNotes(releaseNotes: ReleaseNotes) {
  if (!releaseNotes) {
    return "";
  }

  if (typeof releaseNotes === "string") {
    return releaseNotes;
  }

  return releaseNotes.map((entry) => entry.note ?? "").join("\n");
}

function isUrgentRelease(releaseNotes: ReleaseNotes) {
  const text = flattenReleaseNotes(releaseNotes).toLowerCase();

  return URGENT_MARKERS.some((marker) => text.includes(marker));
}

class AppUpdater {
  private pendingVersion: string | null = null;
  private notifyTimer: NodeJS.Timeout | null = null;

  init() {
    autoUpdater.logger = log;

    if (config.get("updates.showNotifications")) {
      autoUpdater.on("update-downloaded", (updateInfo) => {
        this.handleUpdateDownloaded(updateInfo);
      });
    }

    if (is.dev || !config.get("updates.autoCheck")) {
      return;
    }

    autoUpdater.checkForUpdates();

    setInterval(
      () => {
        autoUpdater.checkForUpdates();
      },
      1000 * 60 * 60 * 3,
    );
  }

  checkForUpdates() {
    if (is.dev) {
      return;
    }

    autoUpdater.checkForUpdates();
  }

  quitAndInstall() {
    main.saveWindowState();

    appState.isQuittingApp = true;

    autoUpdater.quitAndInstall();
  }

  private handleUpdateDownloaded(updateInfo: UpdateDownloadedEvent) {
    const delayMs = NOTIFICATION_DELAY_MS[config.get("updates.notificationDelay")];

    if (delayMs === 0 || isUrgentRelease(updateInfo.releaseNotes)) {
      this.clearPendingNotification();
      this.notifyRenderer(updateInfo.version);

      return;
    }

    this.clearPendingNotification();

    this.pendingVersion = updateInfo.version;

    this.notifyTimer = setTimeout(() => {
      const version = this.pendingVersion;

      this.notifyTimer = null;
      this.pendingVersion = null;

      if (version) {
        this.notifyRenderer(version);
      }
    }, delayMs);
  }

  private clearPendingNotification() {
    if (this.notifyTimer) {
      clearTimeout(this.notifyTimer);
      this.notifyTimer = null;
    }

    this.pendingVersion = null;
  }

  private notifyRenderer(version: string) {
    ipc.renderer.send(main.window.webContents, "appUpdater.updateAvailable", `v${version}`);
  }
}

export const appUpdater = new AppUpdater();
