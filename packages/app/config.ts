import { randomUUID } from "node:crypto";
import { is, platform } from "@electron-toolkit/utils";
import type { Config } from "@meru/shared/types";
import { app } from "electron";
import Store from "electron-store";

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
      },
    ],
    "accounts.unreadBadge": true,
    launchMinimized: false,
    launchAtLogin: false,
    hardwareAcceleration: false,
    resetApp: false,
    theme: "system",
    licenseKey: null,
    customUserAgent: false,
    "dock.enabled": true,
    "dock.unreadBadge": true,
    "externalLinks.confirm": true,
    "externalLinks.trustedHosts": [],
    "gmail.zoomFactor": 1,
    "downloads.saveAs": false,
    "downloads.openFolderWhenDone": false,
    "downloads.location": app.getPath("downloads"),
    "downloads.history": [],
    "notifications.enabled": true,
    "notifications.showSender": true,
    "notifications.showSubject": true,
    "notifications.showSummary": true,
    "notifications.playSound": true,
    "notifications.allowFromGoogleApps": false,
    "notifications.sound": "linen",
    "notifications.volume": 1,
    "notifications.downloadCompleted": true,
    "notifications.times": [],
    "updates.autoCheck": true,
    "updates.showNotifications": true,
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
    "gmail.reverseConversation": false,
    "gmail.savedSearches": [],
    "gmail.unreadCountPreference": "inbox",
    "gmail.openComposeInNewWindow": false,
    "gmail.showSenderIcons": true,
    "gmail.moveAttachmentsToTop": false,
    "gmail.closeComposeWindowAfterSend": false,
    "gmail.replyForwardInPopOut": false,
    "gmail.inboxCategoriesToMonitor": "primary",
    "screenShare.useSystemPicker": true,
    "window.lastState": {
      bounds: DEFAULT_WINDOW_STATE_BOUNDS,
      fullscreen: false,
      maximized: false,
      displayId: null,
    },
    "window.restrictMinimumSize": true,
    "trial.expired": false,
    "googleApps.openInApp": true,
    "googleApps.openAppsInNewWindow": false,
    "googleApps.pinnedApps": [],
    "googleApps.showAccountColor": true,
    "googleApps.showAccountLabel": true,
    "verificationCodes.autoCopy": false,
    "verificationCodes.autoDelete": false,
    "verificationCodes.autoMarkAsRead": false,
    "verificationCodes.confidence": "high",
    "doNotDisturb.enabled": false,
    "doNotDisturb.duration": null,
    "doNotDisturb.until": null,
    "unifiedInbox.enabled": true,
    "unifiedInbox.showSenderIcons": true,
    "unifiedInbox.rowsPerPage": 10,
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
    ">=3.9.3": (store) => {
      const lastWindowState = store.get("window.lastState");

      if (lastWindowState && typeof lastWindowState.displayId === "undefined") {
        lastWindowState.displayId = null;

        store.set("window.lastState", lastWindowState);
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
  },
});
