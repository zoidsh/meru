import type { GmailMail, GmailState } from "@/gmail";
import type { mailActionCodeMap } from "@/gmail/preload/inbox-observer";
import { type AccountConfig, config } from "@/lib/config";
import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/main";
import { platform } from "@electron-toolkit/utils";
import { Notification } from "electron";
import { accounts } from "./accounts";
import { appState } from "./app-state";
import { main } from "./main";

export type IpcMainEvents =
	| {
			selectAccount: [selectedAccountId: AccountConfig["id"]];
			addAccount: [addedAccount: Pick<AccountConfig, "label">];
			removeAccount: [removedAccountId: AccountConfig["id"]];
			updateAccount: [updatedAccount: AccountConfig];
			moveAccount: [
				movedAccountId: AccountConfig["id"],
				direction: "up" | "down",
			];
			controlWindow: [action: "minimize" | "maximize" | "unmaximize" | "close"];
			toggleIsSettingsOpen: [];
			goNavigationHistory: [action: "back" | "forward"];
			reloadGmail: [];
			updateUnreadCount: [unreadCount: number];
			handleNewMails: [mails: GmailMail[]];
	  }
	| {
			getIsSettingsOpen: () => boolean;
			getAccounts: () => {
				config: AccountConfig;
				gmail: { state: GmailState };
			}[];
			getIsWindowMaximized: () => boolean;
	  };

export type IpcRendererEvent = {
	onIsSettingsOpenChanged: [settingsOpen: boolean];
	onAccountsChanged: [
		accounts: {
			config: AccountConfig;
			gmail: { state: GmailState };
		}[],
	];
	onWindowMaximizedChanged: [maximized: boolean];
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
};

export const ipcMain = new IpcListener<IpcMainEvents>();

export const ipcRenderer = new IpcEmitter<IpcRendererEvent>();

export function initIpc() {
	ipcMain.handle("getIsSettingsOpen", () => appState.isSettingsOpen);

	ipcMain.on("toggleIsSettingsOpen", () => {
		appState.toggleIsSettingsOpen();
	});

	ipcMain.handle("getAccounts", () =>
		accounts.getAccounts().map((account) => ({
			config: account.config,
			gmail: {
				state: account.gmail.state,
			},
		})),
	);

	accounts.on("accounts-changed", (accounts) => {
		ipcRenderer.send(
			main.window.webContents,
			"onAccountsChanged",
			accounts.map((account) => ({
				config: account.config,
				gmail: {
					state: account.gmail.state,
				},
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

	ipcMain.handle("getIsWindowMaximized", () => main.window.isMaximized());

	ipcMain.on("controlWindow", (_event, action) => {
		switch (action) {
			case "minimize": {
				main.window.minimize();
				break;
			}
			case "maximize": {
				main.window.maximize();
				break;
			}
			case "unmaximize": {
				main.window.unmaximize();
				break;
			}
			case "close": {
				main.window.close();
				break;
			}
		}
	});

	main.window
		.on("maximize", () => {
			ipcRenderer.send(
				main.window.webContents,
				"onWindowMaximizedChanged",
				true,
			);
		})
		.on("unmaximize", () => {
			ipcRenderer.send(
				main.window.webContents,
				"onWindowMaximizedChanged",
				true,
			);
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

	if (Notification.isSupported()) {
		ipcMain.on("handleNewMails", async (event, mails) => {
			if (!config.get("notifications.enabled")) {
				return;
			}

			for (const mail of mails) {
				for (const [accountId, gmail] of accounts.gmails) {
					if (gmail.view.webContents.id === event.sender.id) {
						const account = accounts.getAccount(accountId);

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
