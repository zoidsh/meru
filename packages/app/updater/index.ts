import { is } from "@electron-toolkit/utils";
import { autoUpdater } from "electron-updater";
import { config } from "@/config";
import { showUnsupportedMacOSDialog } from "../dialogs";
import { ipc } from "../ipc";
import { log } from "../lib/log";
import { main } from "../main";
import { shouldAnnounceUpdate } from "./announce";
import { resolveUpdateChannel } from "./channel";
import { isUpdateSupported, MINIMUM_MACOS_VERSION } from "./support";

class AppUpdater {
  private lastAnnouncedVersion: string | null = null;

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

  isUpdateSupported() {
    return isUpdateSupported(process.platform, process.getSystemVersion());
  }

  init() {
    autoUpdater.logger = log;

    this.applyChannel();

    autoUpdater.isUpdateSupported = () => this.isUpdateSupported();

    config.onDidChange("updates.channel", () => {
      this.applyChannel();

      this.checkForUpdates();
    });

    if (config.get("updates.showNotifications")) {
      autoUpdater.on("update-downloaded", (updateInfo) => {
        // electron-updater re-emits this on every check once a version is downloaded.
        if (!shouldAnnounceUpdate(this.lastAnnouncedVersion, updateInfo.version)) {
          return;
        }

        ipc.renderer.send(
          main.window.webContents,
          "appUpdater.updateAvailable",
          `v${updateInfo.version}`,
        );

        this.lastAnnouncedVersion = updateInfo.version;
      });
    }

    const systemVersion = process.getSystemVersion();

    if (!this.isUpdateSupported()) {
      log.info(`Updates need macOS ${MINIMUM_MACOS_VERSION}, this Mac reports ${systemVersion}`);

      if (config.get("updates.autoCheck")) {
        showUnsupportedMacOSDialog();
      }

      return;
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
    if (is.dev || !this.isUpdateSupported()) {
      return;
    }

    this.lastAnnouncedVersion = null;

    autoUpdater.checkForUpdates();
  }

  quitAndInstall() {
    main.saveWindowState();

    main.isQuittingApp = true;

    autoUpdater.quitAndInstall();
  }
}

export const appUpdater = new AppUpdater();
