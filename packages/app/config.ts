import { randomUUID } from "node:crypto";
import { is, platform } from "@electron-toolkit/utils";
import type { SavedTab } from "@meru/shared/schemas";
import type { Config } from "@meru/shared/types";
import { app } from "electron";
import Store from "electron-store";

/** A saved tab as it was written before bookmarks became a list of their own. */
type LegacySavedTab = SavedTab & {
  persistence?: "pinned" | "bookmarked";
};

export const DEFAULT_WINDOW_STATE_BOUNDS = {
  width: 1280,
  height: 800,
  x: undefined,
  y: undefined,
};

export const config = new Store<Config>({
  name: is.dev ? "config.dev" : "config",
  accessPropertiesByDotNotation: false,
  defaults: {
    accounts: [
      {
        id: randomUUID(),
        label: "Default",
        color: null,
        selected: true,
        notifications: true,
        gmail: {
          unreadBadge: true,
          delegatedAccountId: null,
          unifiedInbox: true,
        },
        workspaceApps: {
          savedTabs: [],
          bookmarks: [],
        },
      },
    ],
    "accounts.unreadBadge": true,
    "app.hardwareAcceleration": true,
    launchMinimized: false,
    launchAtLogin: false,
    resetApp: false,
    theme: "system",
    licenseKey: null,
    customUserAgent: false,
    "dock.enabled": true,
    "dock.unreadBadge": true,
    "externalLinks.confirm": true,
    "externalLinks.trustedHosts": [],
    "downloads.saveAs": false,
    "downloads.openFolderWhenDone": false,
    "downloads.location": app.getPath("downloads"),
    "downloads.history": [],
    "notifications.enabled": true,
    "notifications.showSender": true,
    "notifications.showSubject": true,
    "notifications.showSummary": true,
    "notifications.playSound": true,
    "notifications.allowFromWorkspaceApps": true,
    "notifications.sound": "linen",
    "notifications.volume": 1,
    "notifications.downloadCompleted": true,
    "notifications.onClickDownloadCompleted": "showInFolder",
    "notifications.times": [],
    "updates.autoCheck": true,
    "updates.showNotifications": true,
    "updates.channel": "stable",
    "blocker.enabled": true,
    "blocker.ads": true,
    "blocker.tracking": true,
    "tray.enabled": !platform.isMacOS,
    "tray.iconColor": "system",
    "tray.unreadCount": true,
    "tray.selectAccountWithUnread": false,
    "gmail.hideGmailLogo": true,
    "gmail.hideInboxFooter": true,
    "gmail.hideOutOfOfficeBanner": false,
    "gmail.hidePromoBanner": true,
    "gmail.hideUpgradeButton": true,
    "gmail.reverseConversation": false,
    "gmail.savedSearches": [],
    "gmail.labelColors": [],
    "gmail.unreadCountPreference": "inbox",
    "gmail.openComposeInNewWindow": false,
    "gmail.showSenderIcons": true,
    "gmail.moveAttachmentsToTop": false,
    "gmail.closeComposeWindowAfterSend": false,
    "gmail.replyForwardInPopOut": false,
    "gmail.extendDarkTheme": false,
    "gmail.inboxCategoriesToMonitor": "primary",
    "screenShare.useSystemPicker": true,
    "window.lastState": {
      bounds: DEFAULT_WINDOW_STATE_BOUNDS,
      fullscreen: false,
      maximized: false,
    },
    "window.restrictMinimumSize": true,
    "trial.expired": false,
    "workspaceApps.openInApp": true,
    "workspaceApps.openInAppExcludedApps": [],
    "workspaceApps.mode": "tabs",
    "workspaceApps.launcherApps": [],
    "workspaceApps.launcherDisplay": "auto",
    "workspaceApps.launcherAndBookmarksPlacement": "auto",
    "workspaceApps.showAccountColor": true,
    "workspaceApps.showAccountLabel": true,
    "workspaceApps.persistZoom": true,
    "workspaceApps.zoomFactors": {},
    "workspaceApps.hidePasskeyDialog": false,
    "workspaceApps.hibernation": "selected",
    "workspaceApps.hibernationTimeout": "1h",
    "verificationCodes.autoCopy": false,
    "verificationCodes.copyMode": "immediately",
    "verificationCodes.autoDelete": false,
    "verificationCodes.autoMarkAsRead": false,
    "doNotDisturb.enabled": false,
    "doNotDisturb.duration": null,
    "doNotDisturb.until": null,
    "unifiedInbox.enabled": true,
    "unifiedInbox.showSenderIcons": true,
    "unifiedInbox.rowsPerPage": 10,
    "spellchecker.languages": [],
    "verticalTabs.showWindows": true,
    "verticalTabs.width": "auto",
    "verticalTabs.showWidthToggle": true,
    "verticalTabs.hideUnreadBadgeWhenActive": false,
    "verticalTabs.showAppLinksBadge": true,
    "extensions.installed": [],
  },
  migrations: {
    ">=3.4.0": (store) => {
      // @ts-expect-error: `showDockIcon` is now 'dock.enabled'
      const showDockIcon = store.get("showDockIcon");

      if (typeof showDockIcon === "boolean") {
        store.set("dock.enabled", showDockIcon);

        // @ts-expect-error
        store.delete("showDockIcon");
      }

      const accounts = store.get("accounts");

      if (Array.isArray(accounts)) {
        let accountsMigrated = false;

        for (const account of accounts) {
          // @ts-expect-error: `unreadBadge` is now under 'gmail'
          if (typeof account.unreadBadge === "undefined") {
            // @ts-expect-error
            account.unreadBadge = true;
            accountsMigrated = true;
          }

          if (typeof account.notifications === "undefined") {
            account.notifications = true;
            accountsMigrated = true;
          }
        }

        if (accountsMigrated) {
          store.set("accounts", accounts);
        }
      }
    },
    ">=3.5.0": (store) => {
      // @ts-expect-error: `lastWindowState` is now 'window.lastState'
      const lastWindowState = store.get("lastWindowState");

      if (lastWindowState) {
        // @ts-expect-error
        store.set("window.lastState", lastWindowState);

        // @ts-expect-error
        store.delete("lastWindowState");
      }
    },
    ">=3.11.0": (store) => {
      const accounts = store.get("accounts");

      if (Array.isArray(accounts)) {
        let accountsMigrated = false;

        for (const account of accounts) {
          if (typeof account.gmail === "undefined") {
            // @ts-expect-error: `unreadBadge` is now under 'gmail'
            account.gmail = {
              delegatedAccountId: null,
            };

            accountsMigrated = true;
          }
        }

        if (accountsMigrated) {
          store.set("accounts", accounts);
        }
      }
    },
    ">=3.15.0": (store) => {
      const openGoogleAppsInExternalBrowser = store.get(
        // @ts-expect-error: `googleApps.openInExternalBrowser` is now 'googleApps.openInApp'
        "googleApps.openInExternalBrowser",
      );

      if (typeof openGoogleAppsInExternalBrowser === "boolean") {
        // @ts-expect-error: `googleApps.openInApp` is now 'workspaceApps.openInApp'
        store.set("googleApps.openInApp", !openGoogleAppsInExternalBrowser);
      }
    },
    ">=3.17.0": (store) => {
      // @ts-expect-error: `googleApps.openInExternalBrowser` is now 'googleApps.openInApp'
      if (typeof store.get("googleApps.openInExternalBrowser") === "boolean") {
        store.delete(
          // @ts-expect-error
          "googleApps.openInExternalBrowser",
        );
      }
    },
    ">=3.18.0": (store) => {
      // @ts-expect-error: `app.doNotDisturb` is now 'doNotDisturb.enabled'
      if (typeof store.get("app.doNotDisturb") !== "undefined") {
        // @ts-expect-error
        store.delete("app.doNotDisturb");
      }
    },
    ">=3.19.0": (store) => {
      const accounts = store.get("accounts");

      if (Array.isArray(accounts)) {
        let accountsMigrated = false;

        for (const account of accounts) {
          if (typeof account.color === "undefined") {
            account.color = null;

            accountsMigrated = true;
          }
        }

        if (accountsMigrated) {
          store.set("accounts", accounts);
        }
      }
    },
    ">=3.31.2": (store) => {
      const accounts = store.get("accounts");

      if (Array.isArray(accounts)) {
        let accountsMigrated = false;

        for (const account of accounts) {
          if (
            // @ts-expect-error: `unreadBadge` is now under 'gmail'
            typeof account.unreadBadge === "boolean" &&
            typeof account.gmail.unreadBadge === "undefined"
          ) {
            // @ts-expect-error
            account.gmail.unreadBadge = account.unreadBadge;

            // @ts-expect-error
            delete account.unreadBadge;

            accountsMigrated = true;
          }
        }

        if (accountsMigrated) {
          store.set("accounts", accounts);
        }
      }
    },
    ">=3.35.0": (store) => {
      const notificationSound = store.get("notifications.sound");

      if (["system", "breeze", "chime", "duet", "knock", "linen"].includes(notificationSound)) {
        return;
      }

      store.set("notifications.sound", "linen");
    },
    ">3.38.0": (store) => {
      // @ts-expect-error: `downloadHistory.alwaysOpenInNewWindow` has been removed
      if (typeof store.get("downloadHistory.alwaysOpenInNewWindow") === "boolean") {
        // @ts-expect-error
        store.delete("downloadHistory.alwaysOpenInNewWindow");
      }
    },
    ">3.38.4": (store) => {
      const accounts = store.get("accounts");

      if (Array.isArray(accounts)) {
        let accountsMigrated = false;

        for (const account of accounts) {
          if (typeof account.gmail.unifiedInbox !== "boolean") {
            account.gmail.unifiedInbox = true;

            accountsMigrated = true;
          }
        }

        if (accountsMigrated) {
          store.set("accounts", accounts);
        }
      }
    },
    ">3.39.0": (store) => {
      // @ts-expect-error: `gmail.unreadCountPreference` default value has been changed to 'inbox'
      if (store.get("gmail.unreadCountPreference") === "default") {
        store.set("gmail.unreadCountPreference", "inbox");
      }
    },
    ">3.42.0": (store) => {
      // @ts-expect-error: `resetConfig` has been removed
      if (store.has("resetConfig")) {
        // @ts-expect-error
        store.delete("resetConfig");
      }
    },
    ">3.45.0": (store) => {
      // @ts-expect-error: `updates.notificationDelay` has been removed
      if (store.has("updates.notificationDelay")) {
        // @ts-expect-error
        store.delete("updates.notificationDelay");
      }
    },
    ">3.51.0": (store) => {
      // @ts-expect-error: `hardwareAcceleration` is now 'app.hardwareAcceleration'
      if (typeof store.get("hardwareAcceleration") === "boolean") {
        store.set("app.hardwareAcceleration", true);

        // @ts-expect-error
        store.delete("hardwareAcceleration");
      }
    },
    ">3.57.0": (store) => {
      const renamedKeys = [
        ["googleApps.openInApp", "workspaceApps.openInApp"],
        ["googleApps.openInAppExcludedApps", "workspaceApps.openInAppExcludedApps"],
        ["googleApps.openAppsInNewWindow", "workspaceApps.openAppsInNewWindow"],
        ["googleApps.pinnedApps", "workspaceApps.launcherApps"],
        ["googleApps.showAccountColor", "workspaceApps.showAccountColor"],
        ["googleApps.showAccountLabel", "workspaceApps.showAccountLabel"],
        ["notifications.allowFromGoogleApps", "notifications.allowFromWorkspaceApps"],
      ] as const;

      for (const [previousKey, renamedKey] of renamedKeys) {
        // @ts-expect-error: `googleApps.*` keys are now 'workspaceApps.*'
        const value = store.get(previousKey);

        if (typeof value !== "undefined") {
          // @ts-expect-error
          store.set(renamedKey, value);
        }

        // @ts-expect-error
        store.delete(previousKey);
      }

      // @ts-expect-error: `workspaceApps.openAppsInNewWindow` was removed
      store.delete("workspaceApps.openAppsInNewWindow");

      // @ts-expect-error: `workspaceApps.pinnedApps` is now 'workspaceApps.launcherApps'
      const pinnedApps = store.get("workspaceApps.pinnedApps");

      if (typeof pinnedApps !== "undefined") {
        // @ts-expect-error
        store.set("workspaceApps.launcherApps", pinnedApps);

        // @ts-expect-error
        store.delete("workspaceApps.pinnedApps");
      }

      const accounts = store.get("accounts");

      if (Array.isArray(accounts)) {
        for (const account of accounts) {
          if (typeof account.workspaceApps === "undefined") {
            account.workspaceApps = { savedTabs: [], bookmarks: [] };
          }
        }

        store.set("accounts", accounts);
      }

      // @ts-expect-error: `gmail.zoomFactor` is now an entry in 'workspaceApps.zoomFactors'
      const gmailZoomFactor = store.get("gmail.zoomFactor");

      if (typeof gmailZoomFactor === "number" && gmailZoomFactor !== 1) {
        store.set("workspaceApps.zoomFactors", {
          ...store.get("workspaceApps.zoomFactors"),
          gmail: gmailZoomFactor,
        });
      }

      // @ts-expect-error
      store.delete("gmail.zoomFactor");

      // @ts-expect-error: `gmail.fullDarkTheme` is now 'gmail.extendDarkTheme'
      const fullDarkTheme = store.get("gmail.fullDarkTheme");

      if (typeof fullDarkTheme !== "undefined") {
        // @ts-expect-error
        store.set("gmail.extendDarkTheme", fullDarkTheme);
      }

      // @ts-expect-error
      store.delete("gmail.fullDarkTheme");
    },
    ">3.58.0": (store) => {
      // Workspace app notifications are on by default now, so everyone who
      // never turned them on gets them and opts out instead.
      store.set("notifications.allowFromWorkspaceApps", true);

      // @ts-expect-error: `workspaceApps.openBehavior` is now 'workspaceApps.mode'
      const openBehavior = store.get("workspaceApps.openBehavior");

      if (typeof openBehavior === "string") {
        store.set("workspaceApps.mode", openBehavior === "newWindow" ? "windows" : "tabs");
      }

      // @ts-expect-error
      store.delete("workspaceApps.openBehavior");

      const accounts = store.get("accounts");

      if (Array.isArray(accounts)) {
        for (const account of accounts) {
          const savedTabs = (account.workspaceApps?.savedTabs ?? []) as LegacySavedTab[];

          // A bookmark used to be a saved tab flagged as bookmarked, which made
          // it follow wherever that tab navigated. Bookmarks are a list of
          // saved URLs of their own now, and every saved tab is a pinned one.
          account.workspaceApps = {
            savedTabs: savedTabs
              .filter((savedTab) => savedTab.persistence !== "bookmarked")
              .map((savedTab) => ({
                app: savedTab.app,
                url: savedTab.url,
                title: savedTab.title,
                loadOnLaunch: savedTab.loadOnLaunch,
                hibernatesWhenIdle: false,
                windowed: savedTab.windowed,
                opensLinksForApp: null,
              })),
            bookmarks: savedTabs
              .filter((savedTab) => savedTab.persistence === "bookmarked")
              .map((savedTab) => ({
                id: randomUUID(),
                app: savedTab.app,
                url: savedTab.url,
                title: savedTab.title,
              })),
          };
        }

        store.set("accounts", accounts);
      }
    },
    ">=3.60.0": (store) => {
      // @ts-expect-error: `verificationCodes.confidence` has been removed
      if (store.has("verificationCodes.confidence")) {
        // @ts-expect-error
        store.delete("verificationCodes.confidence");
      }
    },
  },
});
