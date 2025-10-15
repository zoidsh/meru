import type { GMAIL_ACTION_CODE_MAP, GmailMail } from "./gmail";
import type {
	AccountConfig,
	AccountConfigInput,
	AccountInstances,
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
			"titleBar.toggleAppMenu": [];
			"desktopSources.select": [desktopSource: SelectedDesktopSource];
			findInPage: [
				text: string | null,
				options?: { forward?: boolean; findNext: boolean },
			];
			"downloads.removeHistoryItem": [itemId: string];
			"downloads.clearHistory": [];
			"taskbar.setOverlayIcon": [dataUrl: string];
	  }
	| {
			"licenseKey.activate": (licenseKey: string) => { success: boolean };
			"desktopSources.getSources": () => DesktopSources;
			"downloads.getHistory": () => DownloadItem[];
			"downloads.openFile": (filePath: string) => { error: string | null };
			"downloads.showFileInFolder": (filePath: string) => {
				error: string | null;
			};
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
	"theme.darkModeChanged": [darkMode: boolean];
	"accounts.changed": [accounts: AccountInstances];
	"accounts.openAddAccountDialog": [];
	"findInPage.activate": [];
	"findInPage.result": [result: { activeMatch: number; totalMatches: number }];
	"trial.daysLeftChanged": [daysLeft: number];
	"notifications.playSound": [sound: NotificationSound];
	"taskbar.setOverlayIcon": [unreadCount: number];
};
