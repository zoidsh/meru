import type { LoginItemSettings } from "electron";
import type { accountColorsMap } from "./accounts";
import type { GMAIL_ACTION_CODE_MAP } from "./gmail";
import type {
  AccountConfig,
  AccountConfigInput,
  AccountConfigs,
  AccountInstances,
  GmailLabelColors,
  GmailSavedSearches,
} from "./schemas";
import type { AccountTabsState, VerticalTabsWidth } from "./tabs";
import type {
  LauncherWorkspaceApp,
  SupportedWorkspaceApp,
  WorkspaceAppOpenBehavior,
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
  "gmail.fullDarkTheme": boolean;
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
  "trial.expired": boolean;
  "workspaceApps.openInApp": boolean;
  "workspaceApps.openInAppExcludedApps": SupportedWorkspaceApp[];
  "workspaceApps.openBehavior": WorkspaceAppOpenBehavior;
  "workspaceApps.launcherApps": LauncherWorkspaceApp[];
  "workspaceApps.showAccountColor": boolean;
  "workspaceApps.showAccountLabel": boolean;
  "workspaceApps.persistZoom": boolean;
  "workspaceApps.zoomFactors": Partial<Record<SupportedWorkspaceApp, number>>;
  "verificationCodes.autoCopy": boolean;
  "verificationCodes.autoDelete": boolean;
  "verificationCodes.autoMarkAsRead": boolean;
  "verificationCodes.confidence": "high" | "medium";
  "doNotDisturb.enabled": boolean;
  "doNotDisturb.duration": string | null;
  "doNotDisturb.until": number | null;
  "unifiedInbox.enabled": boolean;
  "unifiedInbox.showSenderIcons": boolean;
  "unifiedInbox.rowsPerPage": number;
  "spellchecker.languages": string[];
  "verticalTabs.width": VerticalTabsWidth;
};

export type IpcMainEvents =
  | {
      "accounts.selectAccount": [accountId: AccountConfig["id"]];
      "accounts.selectNextAccount": [];
      "accounts.selectPreviousAccount": [];
      "accounts.addAccount": [account: AccountConfigInput];
      "accounts.removeAccount": [accountId: AccountConfig["id"]];
      "accounts.updateAccount": [account: AccountConfig];
      "workspaceApp.goBack": [workspaceAppId?: string];
      "workspaceApp.goForward": [workspaceAppId?: string];
      "workspaceApp.reload": [workspaceAppId?: string];
      "workspaceApp.stop": [workspaceAppId?: string];
      "gmail.unreadCountChanged": [unreadCountString: string];
      "gmail.setOutOfOffice": [outOfOffice: boolean];
      "gmail.search": [searchQuery: string];
      "gmail.openUserStyles": [openIn: "editor" | "folder"];
      "workspaceApp.showMenu": [workspaceAppId: string];
      "gmail.navigateTo": [hashLocation: GmailHashLocation];
      "gmail.closeComposeWindow": [];
      "gmail.undoMessageSent": [browserWindowId: number];
      "gmail.setUserEmail": [email: string];
      "gmail.openMessage": [messageId: string];
      "titleBar.toggleAppMenu": [];
      "desktopSources.select": [desktopSource: SelectedDesktopSource];
      findInPage: [text: string | null, options?: { forward?: boolean; findNext: boolean }];
      "taskbar.setOverlayIcon": [dataUrl: string];
      "appUpdater.quitAndInstall": [];
      "appUpdater.openVersionHistory": [];
      "app.relaunch": [];
      "theme.setTheme": [theme: "system" | "light" | "dark"];
      "notifications.showTestNotification": [];
      "tabs.selectTab": [accountId: AccountConfig["id"], tabId: string];
      "tabs.closeTab": [accountId: AccountConfig["id"], tabId: string];
      "tabs.moveTab": [accountId: AccountConfig["id"], tabId: string, targetSectionIndex: number];
      "tabs.showTabContextMenu": [accountId: AccountConfig["id"], tabId: string];
      "tabs.showVerticalTabsContextMenu": [accountId: AccountConfig["id"]];
      "workspaceApps.openApp": [
        app: SupportedWorkspaceApp,
        openBehavior?: WorkspaceAppOpenBehavior,
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
      "licenseKey.activate": (licenseKey: string) => { success: boolean };
      "license.getDeviceInfo": () => { label: string };
      "license.updateDeviceInfo": (input: { label: string }) => void;
      "desktopSources.getSources": () => DesktopSources;
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
      "about.exportLogs": () => { canceled: boolean };
      "workspaceApp.getLoadingState": (workspaceAppId?: string) => boolean;
    };

export type IpcRendererEvent = {
  navigate: [to: string];
  "gmail.navigateTo": [hashLocation: GmailHashLocation];
  "gmail.handleMessage": [messageId: string, action: keyof typeof GMAIL_ACTION_CODE_MAP];
  "gmail.openMessage": [messageId: string];
  "gmail.showMessageSentNotification": [browserWindowId: number];
  "gmail.dismissMessageSentNotification": [browserWindowId: number];
  "gmail.undoMessageSent": [];
  "theme.darkModeChanged": [darkMode: boolean];
  "accounts.changed": [accounts: AccountInstances];
  "tabs.changed": [accountsTabs: AccountTabsState[]];
  "accounts.openAddAccountDialog": [];
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
  "config.configChanged": [config: Config];
};
