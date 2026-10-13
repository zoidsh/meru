import { is } from "@electron-toolkit/utils";
import { GITHUB_REPO_URL } from "@meru/shared/constants";
import { autoUpdater } from "electron-updater";
import { accounts } from "@/accounts";
import { config } from "@/config";
import {
  showUnsupportedMacOSDialog,
  showUpdateCheckFailedDialog,
  showUpdateAvailableDialog,
  showUpdateNotAvailableDialog,
} from "../dialogs";
import { ipc } from "../ipc";
import { log } from "../lib/log";
import { main } from "../main";
import { openExternalUrl } from "../url";
import { shouldAnnounceUpdate } from "./announce";
import { resolveUpdateChannel } from "./channel";
import { resolveUpdateErrorReport } from "./errors";
import { isUpdateSupported, MINIMUM_MACOS_VERSION } from "./support";

class AppUpdater {
  private lastAnnouncedVersion: string | null = null;

  private availableVersion: string | null = null;

  /**
   * One flag for the whole updater, rather than one per check: a background
   * check or a channel change starting while a manual one is in flight takes it
   * over, so that manual check can go unanswered, and an error from a download
   * running under a manual check can be reported as a failed check.
   */
  private isManualCheck = false;

  private isInstallingUpdate = false;

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
  private sendUpdateNotVerified(version: string | null) {
    ipc.renderer.send(
      main.window.webContents,
      "appUpdater.updateNotVerified",
      version ? `v${version}` : null,
    );
  }

  private sendUpdateAvailable(version: string | null) {
    ipc.renderer.send(
      main.window.webContents,
      "appUpdater.updateAvailable",
      version ? `v${version}` : null,
    );

    this.lastAnnouncedVersion = version;
  }

  /**
   * Both promises electron-updater hands back reject on their own on top of the
   * `error` event that reports them, so both are swallowed here rather than
   * left to surface as unhandled rejections.
   *
   * A check is only manual until it settles. The download it starts, and the
   * signature failure that can end that, arrive long after the menu item was
   * chosen, so they belong in the titlebar rather than in a dialog.
   */
  private async requestUpdateCheck({ isManualCheck = false }: { isManualCheck?: boolean } = {}) {
    this.isManualCheck = isManualCheck;

    const result = await autoUpdater.checkForUpdates().catch(() => null);

    this.isManualCheck = false;

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

      if (this.isManualCheck) {
        showUpdateAvailableDialog(updateInfo.version);
      }
    });

    autoUpdater.on("update-not-available", () => {
      if (this.isManualCheck) {
        showUpdateNotAvailableDialog();
      }
    });

    // electron-updater attaches an `error` listener of its own that logs every
    // error it dispatches, so this one only has to decide what to say about it.
    autoUpdater.on("error", (error) => {
      // An install with no downloaded file left dispatches its error from
      // inside `quitAndInstall` and returns, so the quitting state set for a
      // quit that is not going to happen is given back: left standing, the
      // close button would destroy the window instead of hiding it, and the
      // next real quit would save neither the window state nor the tabs.
      if (this.isInstallingUpdate) {
        main.isQuittingApp = false;
      }

      const report = resolveUpdateErrorReport(error, { isManualCheck: this.isManualCheck });

      if (report === "checkFailed") {
        showUpdateCheckFailedDialog();
      } else if (report === "updateNotVerified" && this.availableVersion) {
        // electron-updater drops what it downloaded before it verifies the
        // version that replaces it, so an update announced earlier has no
        // installer behind it any more and Restart now would find nothing.
        this.sendUpdateAvailable(null);

        this.sendUpdateNotVerified(this.availableVersion);
      }
    });

    // The setting is read here rather than around the listener, so that turning
    // it on or off takes effect without a restart.
    autoUpdater.on("update-downloaded", (updateInfo) => {
      // A download that got this far passed verification, so a notice about an
      // earlier one is stale, and it comes down before the setting is read
      // since the notice ignores the setting as well.
      this.sendUpdateNotVerified(null);

      if (!config.get("updates.showNotifications")) {
        return;
      }

      // electron-updater re-emits this on every check once a version is downloaded.
      if (!shouldAnnounceUpdate(this.lastAnnouncedVersion, updateInfo.version)) {
        return;
      }

      this.sendUpdateAvailable(updateInfo.version);
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

  checkForUpdates({ isManualCheck = false }: { isManualCheck?: boolean } = {}) {
    if (is.dev || !this.isUpdateSupported()) {
      return;
    }

    this.lastAnnouncedVersion = null;

    this.requestUpdateCheck({ isManualCheck });
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

    this.isInstallingUpdate = true;

    autoUpdater.quitAndInstall();

    this.isInstallingUpdate = false;
  }
}

export const appUpdater = new AppUpdater();
