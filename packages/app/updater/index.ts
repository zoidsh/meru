import { is } from "@electron-toolkit/utils";
import { GITHUB_REPO_URL } from "@meru/shared/constants";
import { autoUpdater } from "electron-updater";
import { accounts } from "@/accounts";
import { config } from "@/config";
import { showUnsupportedMacOSDialog } from "../dialogs";
import { ipc } from "../ipc";
import { log } from "../lib/log";
import { main } from "../main";
import { openExternalUrl } from "../url";
import { shouldAnnounceUpdate } from "./announce";
import { resolveUpdateChannel } from "./channel";
import { isInvalidSignatureError } from "./errors";
import { isUpdateSupported, MINIMUM_MACOS_VERSION } from "./support";

class AppUpdater {
  private lastAnnouncedVersion: string | null = null;

  private availableVersion: string | null = null;

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

  /**
   * Shown whatever `updates.showNotifications` says, unlike an available
   * update: an update Meru won't install is not an announcement but the only
   * way out of an install that can no longer update itself.
   */
  private sendUpdateNotVerified(version: string) {
    ipc.renderer.send(main.window.webContents, "appUpdater.updateNotVerified", `v${version}`);
  }

  /**
   * Both promises electron-updater hands back reject on their own on top of the
   * `error` event that reports them, so both are swallowed here rather than
   * left to surface as unhandled rejections.
   */
  private async requestUpdateCheck() {
    const result = await autoUpdater.checkForUpdates().catch(() => null);

    result?.downloadPromise?.catch(() => null);
  }

  init() {
    autoUpdater.logger = log;

    this.applyChannel();

    autoUpdater.isUpdateSupported = () => this.isUpdateSupported();

    config.onDidChange("updates.channel", () => {
      this.applyChannel();

      this.checkForUpdates();
    });

    autoUpdater.on("update-available", (updateInfo) => {
      this.availableVersion = updateInfo.version;
    });

    // electron-updater attaches an `error` listener of its own that logs every
    // error it dispatches, so this one only has to decide what to say about it.
    autoUpdater.on("error", (error) => {
      if (isInvalidSignatureError(error) && this.availableVersion) {
        this.sendUpdateNotVerified(this.availableVersion);
      }
    });

    // The setting is read here rather than around the listener, so that turning
    // it on or off takes effect without a restart.
    autoUpdater.on("update-downloaded", (updateInfo) => {
      if (!config.get("updates.showNotifications")) {
        return;
      }

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

    this.requestUpdateCheck();

    setInterval(
      () => {
        this.requestUpdateCheck();
      },
      1000 * 60 * 60 * 3,
    );
  }

  checkForUpdates() {
    if (is.dev || !this.isUpdateSupported()) {
      return;
    }

    this.lastAnnouncedVersion = null;

    this.requestUpdateCheck();
  }

  openReleasePage() {
    openExternalUrl(
      this.availableVersion
        ? `${GITHUB_REPO_URL}/releases/tag/v${this.availableVersion}`
        : `${GITHUB_REPO_URL}/releases`,
    );
  }

  quitAndInstall() {
    main.saveWindowState();

    // Set after the save, since saveTabs() is a no-op once the app is quitting
    accounts.saveTabs();

    main.isQuittingApp = true;

    autoUpdater.quitAndInstall();
  }
}

export const appUpdater = new AppUpdater();
