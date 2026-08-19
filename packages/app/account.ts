import { platform } from "@electron-toolkit/utils";
import { GOOGLE_MEET_URL } from "@meru/shared/constants";
import type { AccountConfig } from "@meru/shared/schemas";
import type { VerticalTabsSessionWidth } from "@meru/shared/tabs";
import type { SelectedDesktopSource } from "@meru/shared/types";
import { app, type IpcMainEvent, ipcMain, type Session, session } from "electron";
import { serializeError } from "serialize-error";
import { blocker } from "./blocker";
import { config } from "./config";
import { extensions } from "./extensions";
import { Gmail } from "./gmail";
import { log } from "./lib/log";
import { createBrowserWindow, getPreloadPath, loadRenderer } from "./lib/window";
import { licenseKey } from "./license-key";
import { main } from "./main";
import { areWorkspaceAppNotificationsAllowed } from "./notifications";
import { Tabs } from "./tabs";
import { WorkspaceApp } from "./workspace-app";

const EXTENSION_PAGE_PERMISSIONS = new Set([
  "clipboard-read",
  "clipboard-sanitized-write",
  "notifications",
]);

export class Account {
  accountId: AccountConfig["id"];

  session: Session;

  gmail: Gmail;

  tabs: Tabs;

  /**
   * The width the strip was last given by hand, kept here rather than in the
   * config so it belongs to this account for this run of the app and is gone by
   * the next one. `null` leaves the width to the setting.
   */
  verticalTabsWidth: VerticalTabsSessionWidth | null = null;

  constructor(accountConfig: AccountConfig) {
    this.accountId = accountConfig.id;

    this.session = session.fromPartition(`persist:${accountConfig.id}`);

    this.setCustomUserAgent();

    this.registerSessionPermissionsRequestsHandler();

    this.registerSessionPermissionsCheckHandler();

    this.registerSessionDisplayMediaRequestHandler();

    blocker.setupSession(this.session);

    const extensionsLoaded = extensions.setupSession(this.session).catch((error: unknown) => {
      log.error("Failed to set up extensions", { error: serializeError(error) });
    });

    this.setSpellCheckerLanguages();

    this.gmail = new Gmail({
      accountId: accountConfig.id,
      session: this.session,
      unreadCountEnabled: accountConfig.gmail.unreadBadge,
      unifiedInboxEnabled: accountConfig.gmail.unifiedInbox,
      delegatedAccountId: accountConfig.gmail.delegatedAccountId,
      extensionsLoaded,
    });

    this.tabs = new Tabs(accountConfig.id, this.gmail);

    this.tabs.restoreSavedTabs(accountConfig.workspaceApps.savedTabs);
  }

  destroy() {
    this.session.setPermissionRequestHandler(null);

    this.session.setPermissionCheckHandler(null);

    this.session.setDisplayMediaRequestHandler(null);

    blocker.teardownSession(this.session);

    extensions.teardownSession(this.session);
  }

  setSpellCheckerLanguages() {
    if (platform.isMacOS || !licenseKey.isValid) {
      return;
    }

    const additionalLanguages = config.get("spellchecker.languages");

    if (additionalLanguages.length === 0) {
      return;
    }

    const osLocale = app.getLocale();

    this.session.setSpellCheckerLanguages([osLocale, ...additionalLanguages]);
  }

  private setCustomUserAgent() {
    if (platform.isMacOS && config.get("customUserAgent")) {
      this.session.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
      );
    }
  }

  private registerSessionPermissionsRequestsHandler() {
    this.session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
      // Extensions are loaded deliberately, but their pages still only get what
      // a curated extension has business asking for — copying a password, a
      // notification. Anything else, the microphone and camera above all, meets
      // the same refusal as anywhere: manifest permissions don't gate these
      // requests, and 1Password's own pages are framable by any page in the
      // session
      if (extensions.isLoadedExtensionUrl(this.session, details.requestingUrl)) {
        callback(EXTENSION_PAGE_PERMISSIONS.has(permission));

        return;
      }

      switch (permission) {
        case "clipboard-read":
        case "clipboard-sanitized-write":
        case "fullscreen":
        case "media":
        case "speaker-selection": {
          callback(true);
          break;
        }
        case "notifications": {
          callback(areWorkspaceAppNotificationsAllowed());
          break;
        }
        default: {
          callback(false);
        }
      }
    });
  }

  private registerSessionPermissionsCheckHandler() {
    this.session.setPermissionCheckHandler((_webContents, permission) => {
      if (permission === "notifications") {
        return areWorkspaceAppNotificationsAllowed();
      }

      return true;
    });
  }

  private findGoogleMeetParentWindow() {
    for (const windowedWorkspaceApp of WorkspaceApp.getAccountWindowedInstances(this.accountId)) {
      if (windowedWorkspaceApp.view.webContents.getURL().startsWith(GOOGLE_MEET_URL)) {
        return windowedWorkspaceApp.window;
      }
    }

    const hasEmbeddedGoogleMeetTab = this.tabs.tabs.some(
      (tab) =>
        tab instanceof WorkspaceApp &&
        !tab.isWindowed &&
        tab.view.webContents.getURL().startsWith(GOOGLE_MEET_URL),
    );

    if (hasEmbeddedGoogleMeetTab) {
      return main.window;
    }
  }

  private registerSessionDisplayMediaRequestHandler() {
    this.session.setDisplayMediaRequestHandler(
      (_request, callback) => {
        const googleMeetParentWindow = this.findGoogleMeetParentWindow();

        if (!googleMeetParentWindow) {
          callback({});

          return;
        }

        const desktopSourcesWindow = createBrowserWindow({
          title: "Choose what to share",
          parent: googleMeetParentWindow,
          width: 576,
          height: 512,
          resizable: false,
          autoHideMenuBar: true,
          webPreferences: {
            preload: getPreloadPath("renderer"),
          },
        });

        const windowEvent = "closed";

        const ipcEvent = "desktopSources.select";

        const ipcListener = (_event: IpcMainEvent, desktopSource: SelectedDesktopSource) => {
          desktopSourcesWindow.removeListener(windowEvent, windowListener);

          callback({ video: desktopSource });

          desktopSourcesWindow.destroy();
        };

        const windowListener = () => {
          ipcMain.removeListener(ipcEvent, ipcListener);

          callback({});

          desktopSourcesWindow.destroy();
        };

        ipcMain.once(ipcEvent, ipcListener);

        desktopSourcesWindow.once(windowEvent, windowListener);

        loadRenderer(desktopSourcesWindow, {
          page: "desktop-sources",
        });
      },
      { useSystemPicker: config.get("screenShare.useSystemPicker") },
    );
  }
}
