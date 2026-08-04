import type { LoginItemSettings } from "electron";
import type { accountColorsMap } from "./accounts";
import { APP_TAB_STRIP_NARROW_WIDTH, APP_TAB_STRIP_WIDE_WIDTH } from "./constants";
import { type GMAIL_ACTION_CODE_MAP, GMAIL_URL } from "./gmail";
import type {
  AccountConfig,
  AccountConfigInput,
  AccountConfigs,
  AccountInstances,
  GmailLabelColors,
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

export type NotificationTime = {
  id: string;
  start: string; // "HH:mm" 24-hour
  end: string; // "HH:mm" 24-hour
  days?: number[]; // 0=Sun,1=Mon,...,6=Sat; undefined/empty = all days
};

type WorkspaceAppDefinition = {
  label: string;
  url?: string;
  pinnable?: boolean;
  alwaysOpenAsWindow?: boolean;
  singleInstance?: boolean;
};

const workspaceAppDefinitions = {
  calendar: { label: "Calendar" },
  chat: { label: "Chat" },
  classroom: { label: "Classroom" },
  contacts: { label: "Contacts" },
  docs: { label: "Docs" },
  drive: { label: "Drive" },
  forms: { label: "Forms" },
  gemini: { label: "Gemini" },
  gmail: { label: "Gmail", url: GMAIL_URL, pinnable: false, singleInstance: true },
  groups: { label: "Groups" },
  keep: { label: "Keep" },
  meet: { label: "Meet" },
  myaccount: { label: "My Account", pinnable: false, alwaysOpenAsWindow: true },
  notebooklm: { label: "NotebookLM" },
  sheets: { label: "Sheets" },
  sites: { label: "Sites" },
  slides: { label: "Slides" },
  tasks: { label: "Tasks" },
  voice: { label: "Voice" },
} as const satisfies Record<string, WorkspaceAppDefinition>;

export type SupportedWorkspaceApp = keyof typeof workspaceAppDefinitions;

export type PinnableWorkspaceApp = {
  [App in SupportedWorkspaceApp]: (typeof workspaceAppDefinitions)[App] extends { pinnable: false }
    ? never
    : App;
}[SupportedWorkspaceApp];

export const workspaceApps: Record<SupportedWorkspaceApp, WorkspaceAppDefinition> =
  workspaceAppDefinitions;

export const pinnableWorkspaceApps = Object.fromEntries(
  Object.entries(workspaceApps)
    .filter(([, workspaceAppDefinition]) => workspaceAppDefinition.pinnable !== false)
    .map(([workspaceApp, workspaceAppDefinition]) => [workspaceApp, workspaceAppDefinition.label]),
) as Record<PinnableWorkspaceApp, string>;

export type WorkspaceAppOpenDisposition = "foreground-tab" | "background-tab" | "new-window";

export const GMAIL_TAB_ID = "gmail";

export type TabState = {
  id: string;
  app: SupportedWorkspaceApp | undefined;
  title: string;
  active: boolean;
};

export type AccountTabsState = {
  accountId: AccountConfig["id"];
  tabs: TabState[];
};

export function getTabStripWidth(tabs: Pick<TabState, "app">[]) {
  if (tabs.length <= 1) {
    return 0;
  }

  const workspaceAppTabCounts = new Map<SupportedWorkspaceApp, number>();

  for (const tab of tabs) {
    if (tab.app) {
      workspaceAppTabCounts.set(tab.app, (workspaceAppTabCounts.get(tab.app) ?? 0) + 1);
    }
  }

  const hasWorkspaceAppWithMultipleTabs = Array.from(workspaceAppTabCounts.values()).some(
    (workspaceAppTabCount) => workspaceAppTabCount > 1,
  );

  return hasWorkspaceAppWithMultipleTabs ? APP_TAB_STRIP_WIDE_WIDTH : APP_TAB_STRIP_NARROW_WIDTH;
}

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
  "workspaceApps.openAppsInNewWindow": boolean;
  "workspaceApps.pinnedApps": PinnableWorkspaceApp[];
  "workspaceApps.showAccountColor": boolean;
  "workspaceApps.showAccountLabel": boolean;
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
};

export type IpcMainEvents =
  | {
      "accounts.selectAccount": [accountId: AccountConfig["id"]];
      "accounts.selectNextAccount": [];
      "accounts.selectPreviousAccount": [];
      "accounts.addAccount": [account: AccountConfigInput];
      "accounts.removeAccount": [accountId: AccountConfig["id"]];
      "accounts.updateAccount": [account: AccountConfig];
      "settings.toggleIsOpen": [open?: boolean];
      "gmail.moveNavigationHistory": [move: "back" | "forward"];
      "gmail.unreadCountChanged": [unreadCountString: string];
      "gmail.setOutOfOffice": [outOfOffice: boolean];
      "gmail.search": [searchQuery: string];
      "gmail.openUserStyles": [openIn: "editor" | "folder"];
      "workspaceApp.goBack": [];
      "workspaceApp.goForward": [];
      "workspaceApp.reload": [];
      "workspaceApp.stop": [];
      "workspaceApp.copyUrl": [];
      "workspaceApp.openInBrowser": [];
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
      "workspaceApps.openApp": [
        app: PinnableWorkspaceApp,
        disposition?: WorkspaceAppOpenDisposition,
      ];
      "tabs.selectTab": [accountId: AccountConfig["id"], tabId: string];
      "tabs.closeTab": [accountId: AccountConfig["id"], tabId: string];
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
      "workspaceApp.getLoadingState": () => boolean;
    };

export type IpcRendererEvent = {
  navigate: [to: string];
  "settings.setIsOpen": [isOpen: boolean];
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
