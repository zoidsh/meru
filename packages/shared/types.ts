import type { LoginItemSettings } from "electron";
import type { accountColorsMap } from "./accounts";
import type { GMAIL_ACTION_CODE_MAP } from "./gmail";
import type {
  AccountConfig,
  AccountConfigInput,
  AccountConfigs,
  AccountInstances,
  GmailSavedSearches,
} from "./schemas";

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

export const googleAppsPinnedApps = {
  calendar: "Calendar",
  chat: "Chat",
  classroom: "Classroom",
  contacts: "Contacts",
  docs: "Docs",
  drive: "Drive",
  forms: "Forms",
  gemini: "Gemini",
  keep: "Keep",
  meet: "Meet",
  notebooklm: "NotebookLM",
  tasks: "Tasks",
  sheets: "Sheets",
  slides: "Slides",
} as const;

export type GoogleAppsPinnedApp = keyof typeof googleAppsPinnedApps;

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
  launchMinimized: boolean;
  launchAtLogin: boolean;
  hardwareAcceleration: boolean;
  resetApp: boolean;
  theme: "system" | "light" | "dark";
  licenseKey: string | null;
  customUserAgent: boolean;
  "dock.enabled": boolean;
  "dock.unreadBadge": boolean;
  "externalLinks.confirm": boolean;
  "externalLinks.trustedHosts": string[];
  "gmail.zoomFactor": number;
  "downloads.saveAs": boolean;
  "downloads.openFolderWhenDone": boolean;
  "downloads.location": string;
  "downloads.history": DownloadItem[];
  "notifications.enabled": boolean;
  "notifications.showSender": boolean;
  "notifications.showSubject": boolean;
  "notifications.showSummary": boolean;
  "notifications.playSound": boolean;
  "notifications.allowFromGoogleApps": boolean;
  "notifications.sound": "system" | NotificationSound;
  "notifications.volume": number;
  "notifications.downloadCompleted": boolean;
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
  "gmail.reverseConversation": boolean;
  "gmail.savedSearches": GmailSavedSearches;
  "gmail.unreadCountPreference": "first-section" | "inbox";
  "gmail.openComposeInNewWindow": boolean;
  "gmail.showSenderIcons": boolean;
  "gmail.moveAttachmentsToTop": boolean;
  "gmail.closeComposeWindowAfterSend": boolean;
  "gmail.replyForwardInPopOut": boolean;
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
    displayId: number | null;
  };
  "window.restrictMinimumSize": boolean;
  "trial.expired": boolean;
  "googleApps.openInApp": boolean;
  "googleApps.openAppsInNewWindow": boolean;
  "googleApps.pinnedApps": GoogleAppsPinnedApp[];
  "googleApps.showAccountColor": boolean;
  "googleApps.showAccountLabel": boolean;
  "verificationCodes.autoCopy": boolean;
  "verificationCodes.autoDelete": boolean;
  "verificationCodes.autoMarkAsRead": boolean;
  "verificationCodes.confidence": "high" | "medium";
  "doNotDisturb.enabled": boolean;
  "doNotDisturb.duration": string | null;
  "doNotDisturb.until": number | null;
  "unifiedInbox.rowsPerPage": number;
  "spellchecker.languages": string[];
};

export type IpcMainEvents =
  | {
      "accounts.selectAccount": [accountId: AccountConfig["id"]];
      "accounts.selectNextAccount": [];
      "accounts.selectPreviousAccount": [];
      "accounts.addAccount": [account: AccountConfigInput];
      "accounts.removeAccount": [accountId: AccountConfig["id"]];
      "accounts.updateAccount": [account: AccountConfig];
      "accounts.moveAccount": [accountId: AccountConfig["id"], direction: "up" | "down"];
      "settings.toggleIsOpen": [open?: boolean];
      "gmail.moveNavigationHistory": [move: "back" | "forward"];
      "gmail.unreadCountChanged": [unreadCountString: string];
      "gmail.setOutOfOffice": [outOfOffice: boolean];
      "gmail.search": [searchQuery: string];
      "gmail.openUserStylesInEditor": [];
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
      "googleApps.openApp": [app: GoogleAppsPinnedApp];
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
      "downloads.setLocation": () => { canceled: boolean };
      "app.getLoginItemSettings": () => LoginItemSettings;
      "app.setLoginItemSettings": (settings: Partial<LoginItemSettings>) => void;
      "app.getIsDefaultMailtoClient": () => boolean;
      "app.setAsDefaultMailtoClient": () => void;
    };

export type IpcRendererEvent = {
  navigate: [to: string];
  "downloads.itemCompleted": [itemId: string];
  "settings.setIsOpen": [isOpen: boolean];
  "gmail.navigateTo": [hashLocation: GmailHashLocation];
  "gmail.handleMessage": [messageId: string, action: keyof typeof GMAIL_ACTION_CODE_MAP];
  "gmail.openMessage": [messageId: string];
  "gmail.showMessageSentNotification": [browserWindowId: number];
  "gmail.dismissMessageSentNotification": [browserWindowId: number];
  "gmail.undoMessageSent": [];
  "theme.darkModeChanged": [darkMode: boolean];
  "accounts.changed": [accounts: AccountInstances];
  "accounts.openAddAccountDialog": [];
  "findInPage.activate": [];
  "findInPage.result": [result: { activeMatch: number; totalMatches: number }];
  "trial.daysLeftChanged": [daysLeft: number];
  "notifications.playSound": [options: { sound: NotificationSound; volume: number }];
  "taskbar.setOverlayIcon": [unreadCount: number];
  "appUpdater.updateAvailable": [version: string];
  "googleMeet.toggleMicrophone": [];
  "googleMeet.toggleCamera": [];
  "googleApp.initAccountColorIndicator": [
    color: (typeof accountColorsMap)[keyof typeof accountColorsMap]["value"],
  ];
  "config.configChanged": [config: Config];
};
