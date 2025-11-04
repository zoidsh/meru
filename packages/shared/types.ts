import type { LoginItemSettings } from "electron";
import type { GMAIL_ACTION_CODE_MAP, GmailMail } from "./gmail";
import type {
	AccountConfig,
	AccountConfigInput,
	AccountConfigs,
	AccountInstances,
	GmailSavedSearch,
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

export type NotificationSound =
	| "bell"
	| "bubble"
	| "long-pop"
	| "magic-marimba"
	| "magic-ring"
	| "retro-game";

export type Config = {
	accounts: AccountConfigs;
	"accounts.unreadBadge": boolean;
	launchMinimized: boolean;
	launchAtLogin: boolean;
	hardwareAcceleration: boolean;
	resetConfig: boolean;
	theme: "system" | "light" | "dark";
	licenseKey: string | null;
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
	"gmail.hideGmailLogo": boolean;
	"gmail.hideInboxFooter": boolean;
	"gmail.reverseConversation": boolean;
	"gmail.savedSearches": GmailSavedSearches;
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
	"verificationCodes.autoCopy": boolean;
	"verificationCodes.autoDelete": boolean;
};

export type IpcMainEvents =
	| {
			"accounts.selectAccount": [accountId: AccountConfig["id"]];
			"accounts.selectNextAccount": [];
			"accounts.selectPreviousAccount": [];
			"accounts.addAccount": [account: AccountConfigInput];
			"accounts.removeAccount": [accountId: AccountConfig["id"]];
			"accounts.updateAccount": [account: AccountConfig];
			"accounts.moveAccount": [
				accountId: AccountConfig["id"],
				direction: "up" | "down",
			];
			"settings.toggleIsOpen": [];
			"gmail.moveNavigationHistory": [move: "back" | "forward"];
			"gmail.setUnreadCount": [unreadCount: number];
			"gmail.handleNewMessages": [mails: GmailMail[]];
			"gmail.addSavedSearch": [savedSearch: Omit<GmailSavedSearch, "id">];
			"gmail.updateSavedSearch": [savedSearch: GmailSavedSearch];
			"gmail.deleteSavedSearch": [savedSearchId: string];
			"gmail.moveSavedSearch": [savedSearchId: string, move: "up" | "down"];
			"gmail.search": [searchQuery: string];
			"titleBar.toggleAppMenu": [];
			"desktopSources.select": [desktopSource: SelectedDesktopSource];
			findInPage: [
				text: string | null,
				options?: { forward?: boolean; findNext: boolean },
			];
			"downloads.removeHistoryItem": [itemId: string];
			"downloads.clearHistory": [];
			"taskbar.setOverlayIcon": [dataUrl: string];
			"appUpdater.quitAndInstall": [];
			"appUpdater.openVersionHistory": [];
			"app.relaunch": [];
			"theme.setTheme": [theme: "system" | "light" | "dark"];
	  }
	| {
			"licenseKey.activate": (licenseKey: string) => { success: boolean };
			"desktopSources.getSources": () => DesktopSources;
			"downloads.getHistory": () => DownloadItem[];
			"downloads.openFile": (filePath: string) => { error: string | null };
			"downloads.showFileInFolder": (filePath: string) => {
				error: string | null;
			};
			"gmail.getSavedSearches": () => GmailSavedSearches;
			"config.getConfig": () => Config;
			"config.setConfig": (config: Partial<Config>) => void;
			"downloads.setLocation": () => { canceled: boolean };
			"app.getLoginItemSettings": () => LoginItemSettings;
			"app.setLoginItemSettings": (
				settings: Partial<LoginItemSettings>,
			) => void;
			"app.getIsDefaultMailtoClient": () => boolean;
			"app.setAsDefaultMailtoClient": () => void;
	  };

export type IpcRendererEvent = {
	navigate: [to: string];
	"downloads.historyChanged": [downloadHistory: DownloadItem[]];
	"downloads.itemCompleted": [itemId: string];
	"settings.setIsOpen": [isOpen: boolean];
	"gmail.navigateTo": [
		destination:
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
			| "compose",
	];
	"gmail.handleMessage": [
		messageId: string,
		action: keyof typeof GMAIL_ACTION_CODE_MAP,
	];
	"gmail.openMessage": [messageId: string];
	"gmail.savedSearchesChanged": [savedSearches: GmailSavedSearches];
	"theme.darkModeChanged": [darkMode: boolean];
	"accounts.changed": [accounts: AccountInstances];
	"accounts.openAddAccountDialog": [];
	"findInPage.activate": [];
	"findInPage.result": [result: { activeMatch: number; totalMatches: number }];
	"trial.daysLeftChanged": [daysLeft: number];
	"notifications.playSound": [sound: NotificationSound];
	"taskbar.setOverlayIcon": [unreadCount: number];
	"appUpdater.updateAvailable": [version: string];
	"googleMeet.toggleMicrophone": [];
	"googleMeet.toggleCamera": [];
	"config.configChanged": [config: Config];
};
