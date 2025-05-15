import type { GMAIL_ACTION_CODE_MAP, GmailMail } from "./gmail";
import type {
	AccountConfig,
	AccountConfigInput,
	AccountInstances,
} from "./schemas";

export type DesktopSource = { id: string; name: string; thumbnail: string };

export type DesktopSources = DesktopSource[];

export type SelectedDesktopSource = { id: string; name: string };

export type IpcMainEvents =
	| {
			selectAccount: [accountId: AccountConfig["id"]];
			addAccount: [account: AccountConfigInput];
			removeAccount: [accountId: AccountConfig["id"]];
			updateAccount: [account: AccountConfig];
			moveAccount: [accountId: AccountConfig["id"], direction: "up" | "down"];
			toggleIsSettingsOpen: [];
			goNavigationHistory: [action: "back" | "forward"];
			reloadGmail: [];
			updateUnreadCount: [unreadCount: number];
			handleNewMails: [mails: GmailMail[]];
			toggleAppMenu: [];
			selectDesktopSource: [desktopSource: SelectedDesktopSource];
	  }
	| {
			activateLicenseKey: (licenseKey: string) => { success: boolean };
			desktopSources: () => DesktopSources;
	  };

export type IpcRendererEvent = {
	isSettingsOpenChanged: [settingsOpen: boolean];
	accountsChanged: [accounts: AccountInstances];
	navigateTo: [
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
	handleMail: [messageId: string, action: keyof typeof GMAIL_ACTION_CODE_MAP];
	openMail: [messageId: string];
	darkModeChanged: [darkMode: boolean];
};
