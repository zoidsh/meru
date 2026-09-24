import type { LoginItemSettings } from "electron";
import type { accountColorsMap } from "./accounts";
import type { GmailAction, GmailInboxMessage } from "./gmail";
import type {
  AccountConfig,
  AccountConfigInput,
  AccountConfigs,
  AccountInstances,
  Bookmark,
  BookmarkState,
  GmailLabelColors,
  GmailSavedSearches,
} from "./schemas";
import type {
  AccountTabsState,
  VerticalTabsGmailUnreadBadge,
  VerticalTabsSessionWidth,
  VerticalTabsWidth,
} from "./tabs";
import type { VerificationCodeCopyMode } from "./verification-codes";
import type {
  LauncherAndBookmarksPlacement,
  LauncherWorkspaceApp,
  SupportedWorkspaceApp,
  WorkspaceAppBookmarkState,
  WorkspaceAppOpenBehavior,
  WorkspaceAppsHibernation,
  WorkspaceAppsHibernationTimeout,
  WorkspaceAppsLauncherDisplay,
  WorkspaceAppsMode,
} from "./workspace-apps";

export type DesktopSource = { id: string; name: string; thumbnail: string };

export type DesktopSources = DesktopSource[];

export type SelectedDesktopSource = { id: string; name: string };

export type DownloadItem = {
  id: string;
  createdAt: number;
  fileName: string;
  filePath: string;
  exists: boolean;
};

export type NotificationSound = "breeze" | "chime" | "duet" | "knock" | "linen";

export type NotificationTime = {
  id: string;
  start: string; // "HH:mm" 24-hour
  end: string; // "HH:mm" 24-hour
  days?: number[]; // 0=Sun,1=Mon,...,6=Sat; undefined/empty = all days
};

/** Which button asked for the bookmarks popup, and so where it hangs. */
export type BookmarksPopupPlacement = "titlebar" | "verticalTabs";

/** A curated extension as it is installed on disk, which config alone can't tell. */
export type InstalledExtensionState = {
  id: string;
  version: string;
};

/** What an update check did to one extension, which is what the page reports. */
export type ExtensionUpdateResult =
  | { id: string; status: "updated"; version: string }
  | { id: string; status: "upToDate" }
  | { id: string; status: "failed"; error: string };

export type WorkspaceAppNotification = {
  title: string;
  body?: string;
  silent?: boolean;
  requireInteraction?: boolean;
};

type GmailHashLocation =
  | "inbox"
  | "starred"
  | "snoozed"
  | "sent"
  | "drafts"
  | "imp"
  | "scheduled"
  | "all"
  | "trash"
  | "spam"
  | "settings"
  | "compose";

export type Config = {
  accounts: AccountConfigs;
  "accounts.unreadBadge": boolean;
  "app.hardwareAcceleration": boolean;
  launchMinimized: boolean;
  launchAtLogin: boolean;
  resetApp: boolean;
  theme: "system" | "light" | "dark";
  licenseKey: string | null;
  customUserAgent: boolean;
  "dock.enabled": boolean;
  "dock.unreadBadge": boolean;
  "externalLinks.confirm": boolean;
  "externalLinks.trustedHosts": string[];
  "downloads.saveAs": boolean;
  "downloads.openFolderWhenDone": boolean;
  "downloads.location": string;
  "downloads.history": DownloadItem[];
  "notifications.enabled": boolean;
  "notifications.newEmails": "all" | "important";
  "notifications.showSender": boolean;
  "notifications.showSubject": boolean;
  "notifications.showSummary": boolean;
  "notifications.playSound": boolean;
  "notifications.allowFromWorkspaceApps": boolean;
  "notifications.sound": "system" | NotificationSound;
  "notifications.volume": number;
  "notifications.downloadCompleted": boolean;
  "notifications.onClickDownloadCompleted": "openFile" | "showInFolder";
  "notifications.times": NotificationTime[];
  "updates.autoCheck": boolean;
  "updates.showNotifications": boolean;
  "updates.channel": "stable" | "beta";
  "blocker.enabled": boolean;
  "blocker.ads": boolean;
  "blocker.tracking": boolean;
  "tray.enabled": boolean;
  "tray.iconColor": "system" | "light" | "dark";
  "tray.unreadCount": boolean;
  "tray.selectAccountWithUnread": boolean;
  "gmail.hideGmailLogo": boolean;
  "gmail.hideInboxFooter": boolean;
  "gmail.hideOutOfOfficeBanner": boolean;
  "gmail.hidePromoBanner": boolean;
  "gmail.hideUpgradeButton": boolean;
  "gmail.reverseConversation": boolean;
  "gmail.savedSearches": GmailSavedSearches;
  "gmail.labelColors": GmailLabelColors;
  "gmail.unreadCountPreference": "first-section" | "inbox";
  "gmail.openComposeInNewWindow": boolean;
  "gmail.showSenderIcons": boolean;
  "gmail.moveAttachmentsToTop": boolean;
  "gmail.closeComposeWindowAfterSend": boolean;
  "gmail.replyForwardInPopOut": boolean;
  "gmail.extendDarkTheme": boolean;
  "gmail.inboxCategoriesToMonitor": "primary" | "all";
  "screenShare.useSystemPicker": boolean;
  "window.lastState": {
    bounds: {
      width: number;
      height: number;
      x: number | undefined;
      y: number | undefined;
    };
    fullscreen: boolean;
    maximized: boolean;
  };
  "window.restrictMinimumSize": boolean;
  "window.linuxWindowControls": "auto" | "show" | "hide";
  "trial.expired": boolean;
  "workspaceApps.openInApp": boolean;
  "workspaceApps.openInAppExcludedApps": SupportedWorkspaceApp[];
  "workspaceApps.mode": WorkspaceAppsMode;
  "workspaceApps.launcherApps": LauncherWorkspaceApp[];
  "workspaceApps.launcherDisplay": WorkspaceAppsLauncherDisplay;
  "workspaceApps.launcherAndBookmarksPlacement": LauncherAndBookmarksPlacement;
  "workspaceApps.showBookmarksButton": boolean;
  "workspaceApps.showAccountColor": boolean;
  "workspaceApps.showAccountLabel": boolean;
  "workspaceApps.persistZoom": boolean;
  "workspaceApps.zoomFactors": Partial<Record<SupportedWorkspaceApp, number>>;
  "workspaceApps.hidePasskeyDialog": boolean;
  "workspaceApps.hibernation": WorkspaceAppsHibernation;
  "workspaceApps.hibernationTimeout": WorkspaceAppsHibernationTimeout;
  "verificationCodes.autoCopy": boolean;
  "verificationCodes.copyMode": VerificationCodeCopyMode;
  "verificationCodes.autoDelete": boolean;
  "verificationCodes.autoMarkAsRead": boolean;
  "doNotDisturb.enabled": boolean;
  "doNotDisturb.duration": string | null;
  "doNotDisturb.until": number | null;
  "doNotDisturb.showTitlebarButton": boolean;
  "unifiedInbox.enabled": boolean;
  "unifiedInbox.showSenderIcons": boolean;
  "unifiedInbox.rowsPerPage": number;
  "spellchecker.languages": string[];
  "verticalTabs.showWindows": boolean;
  "verticalTabs.width": VerticalTabsWidth;
  "verticalTabs.showWidthToggle": boolean;
  "verticalTabs.gmailUnreadBadge": VerticalTabsGmailUnreadBadge;
  "verticalTabs.showAppLinksBadge": boolean;
  "extensions.enabled": boolean;
  "extensions.installed": string[];
  /**
   * Hostnames the user added to a curated extension's content-script clamp,
   * keyed by extension id. They survive an uninstall, so a reinstall keeps
   * them.
   */
  "extensions.additionalSites": Record<string, string[]>;
};

export type IpcMainEvents =
  | {
      "accounts.selectAccount": [accountId: AccountConfig["id"]];
      "accounts.selectNextAccount": [];
      "accounts.selectPreviousAccount": [];
      "accounts.addAccount": [account: AccountConfigInput];
      "accounts.removeAccount": [accountId: AccountConfig["id"]];
      "accounts.updateAccount": [account: AccountConfig];
      "accounts.setAccountEnabled": [accountId: AccountConfig["id"], enabled: boolean];
      "workspaceApp.goBack": [workspaceAppId?: string];
      "workspaceApp.goForward": [workspaceAppId?: string];
      "workspaceApp.reload": [workspaceAppId?: string];
      "workspaceApp.stop": [workspaceAppId?: string];
      "gmail.unreadCountChanged": [unreadCountString: string];
      "gmail.setOutOfOffice": [outOfOffice: boolean];
      "gmail.search": [searchQuery: string];
      "gmail.openUserStyles": [openIn: "editor" | "folder"];
      "workspaceApp.showMenu": [workspaceAppId: string];
      "workspaceApp.toggleBookmark": [workspaceAppId: string];
      "workspaceApp.showNotification": [notification: WorkspaceAppNotification];
      "gmail.navigateTo": [hashLocation: GmailHashLocation];
      "gmail.closeComposeWindow": [];
      "gmail.undoMessageSent": [browserWindowId: number];
      "gmail.setUserEmail": [email: string];
      "gmail.openMessage": [messageId: string];
      "gmail.messageHandled": [requestId: string, success: boolean];
      "titleBar.toggleAppMenu": [];
      "desktopSources.select": [desktopSource: SelectedDesktopSource];
      findInPage: [text: string | null, options?: { forward?: boolean; findNext: boolean }];
      "taskbar.setOverlayIcon": [dataUrl: string];
      "appUpdater.quitAndInstall": [];
      "appUpdater.openVersionHistory": [];
      "app.relaunch": [];
      "app.openDefaultAppsSettings": [];
      "theme.setTheme": [theme: "system" | "light" | "dark"];
      "notifications.showTestNotification": [];
      "tabs.selectTab": [accountId: AccountConfig["id"], tabId: string];
      "tabs.closeTab": [accountId: AccountConfig["id"], tabId: string];
      "tabs.moveTab": [accountId: AccountConfig["id"], tabId: string, targetSectionIndex: number];
      "tabs.showTabContextMenu": [accountId: AccountConfig["id"], tabId: string];
      "tabs.showVerticalTabsContextMenu": [accountId: AccountConfig["id"]];
      "tabs.setVerticalTabsWidth": [
        accountId: AccountConfig["id"],
        width: VerticalTabsSessionWidth,
      ];
      "workspaceApps.openApp": [
        app: SupportedWorkspaceApp,
        openBehavior?: WorkspaceAppOpenBehavior,
      ];
      "bookmarks.togglePopup": [placement: BookmarksPopupPlacement];
      "bookmarks.closePopup": [];
      "bookmarks.setPopupCloseOnBlurEnabled": [enabled: boolean];
      "bookmarks.openBookmark": [accountId: AccountConfig["id"], bookmarkId: Bookmark["id"]];
      "bookmarks.removeBookmark": [accountId: AccountConfig["id"], bookmarkId: Bookmark["id"]];
      "bookmarks.moveBookmark": [
        accountId: AccountConfig["id"],
        bookmarkId: Bookmark["id"],
        targetIndex: number,
      ];
      "doNotDisturb.toggle": [];
      "doNotDisturb.showOptions": [];
      "downloads.toggleRecentDownloadHistoryPopup": [];
      "downloads.closeRecentDownloadHistoryPopup": [];
      "downloads.setDownloadHistoryPopupOnBlurEnabled": [enabled: boolean];
      "downloads.openDownloadHistory": [];
      "downloads.openFile": [item: Pick<DownloadItem, "id" | "filePath">];
      "downloads.showFileInFolder": [item: Pick<DownloadItem, "id" | "filePath">];
      "downloads.dragFile": [item: Pick<DownloadItem, "id" | "filePath">];
    }
  | {
      "gmail.handleMessage": (
        accountId: AccountConfig["id"],
        messageId: string,
        action: GmailAction,
      ) => void;
      "licenseKey.activate": (licenseKey: string) => { success: boolean };
      "license.getDeviceInfo": () => { label: string };
      "license.updateDeviceInfo": (input: { label: string }) => void;
      "desktopSources.getSources": () => DesktopSources;
      "accounts.getAccounts": () => AccountInstances;
      "trial.getDaysLeft": () => number;
      "config.getConfig": () => Config;
      "config.setConfig": (config: Partial<Config>) => void;
      "spellchecker.getAvailableLanguages": () => string[];
      "spellchecker.getOsLocale": () => string;
      "downloads.setLocation": () => { canceled: boolean };
      "app.getLoginItemSettings": () => LoginItemSettings;
      "app.setLoginItemSettings": (settings: Partial<LoginItemSettings>) => void;
      "app.getIsDefaultMailtoClient": () => boolean;
      "app.setAsDefaultMailtoClient": () => void;
      "about.getInfo": () => { version: string; os: string; deviceId: string };
      "updates.isBelowMinimumMacOSVersion": () => boolean;
      "about.exportLogs": () => { canceled: boolean };
      "workspaceApp.getLoadingState": (workspaceAppId?: string) => boolean;
      "workspaceApp.getBookmarkState": (workspaceAppId: string) => WorkspaceAppBookmarkState;
      "bookmarks.getBookmarks": () => BookmarkState[];
      "extensions.getInstalled": () => InstalledExtensionState[];
      "extensions.install": (extensionId: string) => { error?: string };
      "extensions.uninstall": (extensionId: string) => { error?: string };
      "extensions.update": () => { error?: string; results?: ExtensionUpdateResult[] };
    };

export type IpcRendererEvent = {
  navigate: [to: string];
  "gmail.navigateTo": [hashLocation: GmailHashLocation];
  "gmail.handleMessage": [messageId: string, action: GmailAction, requestId: string];
  "gmail.refreshInbox": [];
  "gmail.inboxChanged": [accountId: AccountConfig["id"], messages: GmailInboxMessage[]];
  "gmail.openMessage": [messageId: string];
  "gmail.showMessageSentNotification": [browserWindowId: number];
  "gmail.dismissMessageSentNotification": [browserWindowId: number];
  "gmail.undoMessageSent": [];
  "theme.darkModeChanged": [darkMode: boolean];
  "accounts.changed": [accounts: AccountInstances];
  "tabs.changed": [accountsTabs: AccountTabsState[]];
  "bookmarks.changed": [bookmarks: BookmarkState[]];
  "findInPage.activate": [];
  "findInPage.result": [result: { activeMatch: number; totalMatches: number }];
  "trial.daysLeftChanged": [daysLeft: number];
  "notifications.playSound": [options: { sound: NotificationSound; volume: number }];
  "taskbar.setOverlayIcon": [unreadCount: number];
  "appUpdater.updateAvailable": [version: string];
  "googleMeet.toggleMicrophone": [];
  "googleMeet.toggleCamera": [];
  "workspaceApp.initAccountColorIndicator": [
    color: (typeof accountColorsMap)[keyof typeof accountColorsMap]["value"],
  ];
  "workspaceApp.navigationStateChanged": [state: { canGoBack: boolean; canGoForward: boolean }];
  "workspaceApp.pageTitleChanged": [title: string];
  "workspaceApp.loadingStateChanged": [loading: boolean];
  "workspaceApp.bookmarkStateChanged": [bookmarkState: WorkspaceAppBookmarkState];
  "config.configChanged": [config: Config];
};
