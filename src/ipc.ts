import type { GmailMail, GmailState } from "@/gmail";
import type { mailActionCodeMap } from "@/gmail/preload/inbox-observer";
import { type AccountConfig, config } from "@/lib/config";
import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/main";
import { platform } from "@electron-toolkit/utils";
import { Notification } from "electron";
import { accounts } from "./accounts";
import { activateLicenseKey } from "./license-key";
import { main } from "./main";
import { appMenu } from "./menu";
import { appState } from "./state";

export type IpcMainEvents =
	| {
			selectAccount: [selectedAccountId: AccountConfig["id"]];
			addAccount: [
				addedAccount: Pick<
					AccountConfig,
					"label" | "unreadBadge" | "notifications"
				>,
			];
			removeAccount: [removedAccountId: AccountConfig["id"]];
			updateAccount: [updatedAccount: AccountConfig];
			moveAccount: [
				movedAccountId: AccountConfig["id"],
				direction: "up" | "down",
			];
			toggleIsSettingsOpen: [];
			goNavigationHistory: [action: "back" | "forward"];
			reloadGmail: [];
			updateUnreadCount: [unreadCount: number];
			handleNewMails: [mails: GmailMail[]];
			toggleAppMenu: [];
	  }
	| {
			activateLicenseKey: (
				licenseKey: string,
			) => ReturnType<typeof activateLicenseKey>;
	  };

export type Accounts = {
	config: AccountConfig;
	gmail: GmailState;
}[];

export type IpcRendererEvent = {
	isSettingsOpenChanged: [settingsOpen: boolean];
	accountsChanged: [accounts: Accounts];
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
	handleMail: [messageId: string, action: keyof typeof mailActionCodeMap];
	openMail: [messageId: string];
	darkModeChanged: [darkMode: boolean];
};

export const ipcMain = new IpcListener<IpcMainEvents>();

export const ipcRenderer = new IpcEmitter<IpcRendererEvent>();

export function initIpc() {
	ipcMain.on("toggleIsSettingsOpen", () => {
		appState.toggleIsSettingsOpen();

		if (appState.isSettingsOpen) {
			accounts.hide();
		} else {
			accounts.show();
		}
	});

	accounts.on("accounts-changed", (accounts) => {
		ipcRenderer.send(
			main.window.webContents,
			"accountsChanged",
			accounts.map((account) => ({
				config: account.config,
				gmail: account.gmail.state,
			})),
		);
	});

	ipcMain.on("selectAccount", (_event, selectedAccountId) => {
		accounts.selectAccount(selectedAccountId);
	});

	ipcMain.on("addAccount", (_event, accountDetails) => {
		accounts.addAccount(accountDetails);
	});

	ipcMain.on("removeAccount", (_event, selectedAccountId) => {
		accounts.removeAccount(selectedAccountId);
	});

	ipcMain.on("updateAccount", (_event, updatedAccount) => {
		accounts.updateAccount(updatedAccount);
	});

	ipcMain.on("moveAccount", (_event, movedAccountId, direction) => {
		accounts.moveAccount(movedAccountId, direction);
	});

	ipcMain.on("goNavigationHistory", (_event, action) => {
		accounts
			.getSelectedAccount()
			.gmail.view.webContents.navigationHistory[
				action === "back" ? "goBack" : "goForward"
			]();
	});

	ipcMain.on("reloadGmail", () => {
		accounts.getSelectedAccount().gmail.view.webContents.reload();
	});

	ipcMain.on("updateUnreadCount", (event, unreadCount) => {
		for (const gmail of accounts.gmails.values()) {
			if (event.sender.id === gmail.view.webContents.id) {
				gmail.setState({ unreadCount });
			}
		}
	});

	ipcMain.on("toggleAppMenu", () => {
		appMenu.togglePopup();
	});

	ipcMain.handle("activateLicenseKey", (_event, licenseKey) =>
		activateLicenseKey({ licenseKey }),
	);

	if (Notification.isSupported()) {
		ipcMain.on("handleNewMails", async (event, mails) => {
			if (!config.get("notifications.enabled")) {
				return;
			}

			for (const mail of mails) {
				for (const [accountId, gmail] of accounts.gmails) {
					if (gmail.view.webContents.id === event.sender.id) {
						const account = accounts.getAccount(accountId);

						if (!account.config.notifications) {
							break;
						}

						let subtitle: string | undefined;

						if (platform.isMacOS && config.get("notifications.showSubject")) {
							subtitle = mail.subject;
						}

						let body: string | undefined;

						if (platform.isMacOS && config.get("notifications.showSummary")) {
							body = mail.summary;
						} else if (
							!platform.isMacOS &&
							config.get("notifications.showSubject")
						) {
							body = mail.subject;
						}

						const notification = new Notification({
							title: config.get("notifications.showSender")
								? mail.sender.name
								: account.config.label,
							subtitle,
							body,
							silent: !config.get("notifications.playSound"),
							actions: [
								{
									text: "Archive",
									type: "button",
								},
								{
									text: "Mark as read",
									type: "button",
								},
								{
									text: "Delete",
									type: "button",
								},
								{
									text: "Mark as spam",
									type: "button",
								},
							],
						});

						notification.on("action", (_event, index) => {
							switch (index) {
								case 0: {
									ipcRenderer.send(
										event.sender,
										"handleMail",
										mail.messageId,
										"archive",
									);

									break;
								}
								case 1: {
									ipcRenderer.send(
										event.sender,
										"handleMail",
										mail.messageId,
										"markAsRead",
									);

									break;
								}
								case 2: {
									ipcRenderer.send(
										event.sender,
										"handleMail",
										mail.messageId,
										"delete",
									);

									break;
								}
								case 3: {
									ipcRenderer.send(
										event.sender,
										"handleMail",
										mail.messageId,
										"markAsSpam",
									);

									break;
								}
							}
						});

						notification.on("click", () => {
							main.show();

							accounts.selectAccount(accountId);

							ipcRenderer.send(event.sender, "openMail", mail.messageId);
						});

						notification.show();

						break;
					}
				}
			}
		});
	}
}
