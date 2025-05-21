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
			"accounts.selectAccount": [accountId: AccountConfig["id"]];
			"accounts.addAccount": [account: AccountConfigInput];
			"accounts.removeAccount": [accountId: AccountConfig["id"]];
			"accounts.updateAccount": [account: AccountConfig];
			"accounts.moveAccount": [
				accountId: AccountConfig["id"],
				direction: "up" | "down",
			];
			"settings.toggleIsOpen": [];
			"gmail.moveNavigationHistory": [move: "back" | "forward"];
			"gmail.reload": [];
			"gmail.setUnreadCount": [unreadCount: number];
			"gmail.handleNewMessages": [mails: GmailMail[]];
			"titleBar.toggleAppMenu": [];
			"desktopSources.select": [desktopSource: SelectedDesktopSource];
			findInPage: [
				text: string | null,
				options?: { forward?: boolean; findNext: boolean },
			];
	  }
	| {
			"licenseKey.activate": (licenseKey: string) => { success: boolean };
			"desktopSources.getSources": () => DesktopSources;
	  };

export type IpcRendererEvent = {
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
};
