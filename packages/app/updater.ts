import { is } from "@electron-toolkit/utils";
import { autoUpdater } from "electron-updater";
import { config } from "@/config";
import { ipc } from "./ipc";
import { log } from "./lib/log";
import { resolveUpdateChannel } from "./lib/update-channel";
import { isUpdateSupported } from "./lib/update-support";
import { main } from "./main";

class AppUpdater {
  private applyChannel() {
    const { channel, allowPrerelease, allowDowngrade } = resolveUpdateChannel(
      config.get("updates.channel"),
      autoUpdater.currentVersion,
    );

    // The channel setter force-enables allowDowngrade, so it must be assigned last.
    autoUpdater.channel = channel;
    autoUpdater.allowPrerelease = allowPrerelease;
    autoUpdater.allowDowngrade = allowDowngrade;
  }

  init() {
    autoUpdater.logger = log;

    // electron-updater is checked once per update check, after it has decided
    // the feed carries a different version, so a refusal here is one log line
    // per check rather than per poll.
    autoUpdater.isUpdateSupported = (updateInfo) => {
      const systemVersion = process.getSystemVersion();

      if (isUpdateSupported(process.platform, systemVersion)) {
        return true;
      }

      log.info(
        `Not offering update ${updateInfo.version}: ${process.platform} ${systemVersion} is below the minimum system version this build supports`,
      );

      return false;
    };

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

    main.isQuittingApp = true;

    autoUpdater.quitAndInstall();
  }
}

export const appUpdater = new AppUpdater();
