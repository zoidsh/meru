import type { LoginItemSettings } from "electron";
import type { GMAIL_ACTION_CODE_MAP, GmailMail } from "./gmail";
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

export type NotificationSound =
	| "bell"
	| "bubble"
	| "long-pop"
	| "magic-marimba"
	| "magic-ring"
	| "retro-game";

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

export type Config = {
	accounts: AccountConfigs;
	"accounts.unreadBadge": boolean;
	launchMinimized: boolean;
	launchAtLogin: boolean;
	hardwareAcceleration: boolean;
	resetConfig: boolean;
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
	"gmail.hideGmailLogo": boolean;
	"gmail.hideInboxFooter": boolean;
	"gmail.reverseConversation": boolean;
	"gmail.savedSearches": GmailSavedSearches;
	"gmail.unreadCountPreference": "default" | "first-section" | "inbox";
	"gmail.openComposeInNewWindow": boolean;
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
	"verificationCodes.autoCopy": boolean;
	"verificationCodes.autoDelete": boolean;
	"doNotDisturb.enabled": boolean;
	"doNotDisturb.duration": string | null;
	"doNotDisturb.until": number | null;
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
			"gmail.setUnreadCount": [unreadCountString: string];
			"gmail.handleNewMessages": [mails: GmailMail[]];
			"gmail.search": [searchQuery: string];
			"gmail.openUserStylesInEditor": [];
			"titleBar.toggleAppMenu": [];
			"desktopSources.select": [desktopSource: SelectedDesktopSource];
			findInPage: [
				text: string | null,
				options?: { forward?: boolean; findNext: boolean },
			];
			"taskbar.setOverlayIcon": [dataUrl: string];
			"appUpdater.quitAndInstall": [];
			"appUpdater.openVersionHistory": [];
			"app.relaunch": [];
			"theme.setTheme": [theme: "system" | "light" | "dark"];
			"notifications.showTestNotification": [];
			"googleApps.openApp": [app: GoogleAppsPinnedApp];
			"doNotDisturb.toggle": [];
			"doNotDisturb.showOptions": [];
	  }
	| {
			"licenseKey.activate": (licenseKey: string) => { success: boolean };
			"license.getDeviceInfo": () => { label: string };
			"license.updateDeviceInfo": (input: { label: string }) => void;
			"desktopSources.getSources": () => DesktopSources;
			"downloads.openFile": (filePath: string) => { error: string | null };
			"downloads.showFileInFolder": (filePath: string) => {
				error: string | null;
			};
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
	"theme.darkModeChanged": [darkMode: boolean];
	"accounts.changed": [accounts: AccountInstances];
	"accounts.openAddAccountDialog": [];
	"findInPage.activate": [];
	"findInPage.result": [result: { activeMatch: number; totalMatches: number }];
	"trial.daysLeftChanged": [daysLeft: number];
	"notifications.playSound": [
		options: { sound: NotificationSound; volume: number },
	];
	"taskbar.setOverlayIcon": [unreadCount: number];
	"appUpdater.updateAvailable": [version: string];
	"googleMeet.toggleMicrophone": [];
	"googleMeet.toggleCamera": [];
	"config.configChanged": [config: Config];
};
