import { is } from "@electron-toolkit/utils";
import { autoUpdater } from "electron-updater";
import { config } from "@/config";
import { ipc } from "./ipc";
import { log } from "./lib/log";
import { main } from "./main";

class AppUpdater {
  private applyChannel() {
    const channel = config.get("updates.channel");

    // The channel setter force-enables allowDowngrade, so it must be assigned last.
    autoUpdater.channel = channel === "stable" ? null : channel;
    autoUpdater.allowPrerelease = channel !== "stable";
    autoUpdater.allowDowngrade =
      channel === "stable" && autoUpdater.currentVersion.prerelease.length > 0;
  }

  init() {
    autoUpdater.logger = log;

    this.applyChannel();

    config.onDidChange("updates.channel", () => {
      this.applyChannel();

      this.checkForUpdates();
    });

    if (config.get("updates.showNotifications")) {
      autoUpdater.on("update-downloaded", (updateInfo) => {
        ipc.renderer.send(
          main.window.webContents,
          "appUpdater.updateAvailable",
          `v${updateInfo.version}`,
        );
      });
    }

    if (is.dev || !config.get("updates.autoCheck")) {
      return;
    }

    void autoUpdater.checkForUpdates();

    setInterval(
      () => {
        void autoUpdater.checkForUpdates();
      },
      1000 * 60 * 60 * 3,
    );
  }

  checkForUpdates() {
    if (is.dev) {
      return;
    }

    void autoUpdater.checkForUpdates();
  }

  quitAndInstall() {
    main.saveWindowState();

    main.isQuittingApp = true;

    autoUpdater.quitAndInstall();
  }
}

export const appUpdater = new AppUpdater();
