import type { Config } from "./types";

export const DEFAULT_WINDOW_STATE_BOUNDS = {
  width: 1280,
  height: 800,
  x: undefined,
  y: undefined,
};

/**
 * The three values the default config can't compute for itself, because each
 * one comes from the environment the app is running in.
 */
export type DefaultConfigEnvironment = {
  /** The id of the account the config starts with. */
  accountId: string;
  /** Where downloads are saved, which is the platform's downloads directory. */
  downloadsLocation: string;
  /** Whether the tray icon starts on, which it does everywhere but macOS. */
  trayEnabled: boolean;
};

/**
 * The config every install starts from. It lives here rather than in the main
 * process so that anything rendering the app's components outside Electron,
 * such as the component playground, reads the same defaults the app ships with
 * instead of a copy that drifts from them.
 */
export function createDefaultConfig({
  accountId,
  downloadsLocation,
  trayEnabled,
}: DefaultConfigEnvironment): Config {
  return {
    accounts: [
      {
        id: accountId,
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
    "downloads.location": downloadsLocation,
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
    "tray.enabled": trayEnabled,
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
    "workspaceApps.hibernation": "unpinned",
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
    "extensions.enabled": true,
    "extensions.installed": [],
    "extensions.showTitlebarButton": false,
  };
}
