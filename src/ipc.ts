import { randomUUID } from "node:crypto";
import { getAccount, getAccounts, selectAccount } from "@/lib/accounts";
import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/main";
import { platform } from "@electron-toolkit/utils";
import { Notification, app } from "electron";
import { appState } from "./app-state";
import type { Gmail, GmailMail, GmailNavigationHistory } from "./gmail";
import type { mailActionCodeMap } from "./gmail/preload/inbox-observer";
import { config } from "./lib/config";
import type { Account, Accounts } from "./lib/config/types";
import type { Main } from "./main";
import type { Tray } from "./tray";

export type IpcMainEvents =
	| {
			selectAccount: [selectedAccountId: Account["id"]];
			addAccount: [addedAccount: Pick<Account, "label">];
			removeAccount: [removedAccountId: Account["id"]];
			updateAccount: [updatedAccount: Account];
			moveAccount: [movedAccountId: Account["id"], direction: "up" | "down"];
			controlWindow: [action: "minimize" | "maximize" | "unmaximize" | "close"];
			goNavigationHistory: [action: "back" | "forward"];
			reload: [];
			toggleGmailVisible: [];
			"gmail.updateUnreadMails": [count: number];
			"gmail.receivedNewMails": [mails: GmailMail[]];
	  }
	| {
			getTitle: () => string;
			getAccounts: () => Accounts;
			getWindowMaximized: () => boolean;
			getNavigationHistory: () => GmailNavigationHistory;
			getGmailVisible: () => boolean;
			getUnreadMails: () => Map<string, number>;
			getAccountsAttentionRequired: () => Map<string, boolean>;
	  };

export type IpcRendererEvent = {
	onTitleChanged: [title: string];
	onAccountsChanged: [accounts: Accounts];
	onWindowMaximizedChanged: [maximized: boolean];
	onNavigationHistoryChanged: [navigationHistory: GmailNavigationHistory];
	onGmailVisibleChanged: [visible: boolean];
	onUnreadMailsChanged: [unreadInboxes: Map<string, number>];
	onAccountsAttentionRequiredChanged: [
		accountsAttentionRequired: Map<string, boolean>,
	];
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
	"gmail.mail.quickAction": [
		messageId: string,
		action: keyof typeof mailActionCodeMap,
	];
	"gmail.mail.open": [messageId: string];
};

export const ipcMain = new IpcListener<IpcMainEvents>();

export const ipcRenderer = new IpcEmitter<IpcRendererEvent>();

export function initIpc({
	main,
	gmail,
	tray,
}: { main: Main; gmail: Gmail; tray: Tray }) {
	ipcMain.handle("getTitle", () => main.title);

	main.onTitleChanged((title) => {
		ipcRenderer.send(main.window.webContents, "onTitleChanged", title);
	});

	ipcMain.handle("getAccounts", () => getAccounts());

	config.onDidChange("accounts", (accounts) => {
		if (accounts) {
			ipcRenderer.send(main.window.webContents, "onAccountsChanged", accounts);
		}
	});

	ipcMain.on("selectAccount", (_event, selectedAccountId) => {
		selectAccount(selectedAccountId, gmail);
	});

	ipcMain.on("addAccount", (_event, addedAccount) => {
		const account: Account = {
			id: randomUUID(),
			selected: false,
			...addedAccount,
		};

		const accounts = getAccounts();

		accounts.push(account);

		config.set("accounts", accounts);

		gmail.createView(account);

		const { width, height } = main.window.getBounds();

		gmail.setAllViewBounds({
			width,
			height,
			sidebarInset: accounts.length > 1,
		});
	});

	ipcMain.on("removeAccount", (_event, removeAccountId) => {
		const accounts = config
			.get("accounts")
			.filter((account) => account.id !== removeAccountId);

		gmail.removeView(removeAccountId);

		if (accounts.every((account) => account.selected === false)) {
			accounts[0].selected = true;

			gmail.selectView(accounts[0]);
		}

		const { width, height } = main.window.getBounds();

		gmail.setAllViewBounds({
			width,
			height,
			sidebarInset: accounts.length > 1,
		});

		config.set("accounts", accounts);
	});

	ipcMain.on("updateAccount", (_event, updatedAccount) => {
		config.set(
			"accounts",
			config
				.get("accounts")
				.map((account) =>
					account.id === updatedAccount.id
						? { ...account, ...updatedAccount }
						: account,
				),
		);
	});

	ipcMain.on("moveAccount", (_event, movedAccountId, direction) => {
		const accounts = getAccounts();

		const accountIndex = accounts.findIndex(
			(account) => account.id === movedAccountId,
		);

		const account = accounts.splice(accountIndex, 1)[0];

		accounts.splice(
			direction === "up"
				? accountIndex - 1
				: direction === "down"
					? accountIndex + 1
					: accountIndex,
			0,
			account,
		);

		config.set("accounts", accounts);
	});

	ipcMain.handle("getWindowMaximized", () => main.window.isMaximized());

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

	ipcMain.handle("getNavigationHistory", () => {
		return gmail.getNavigationHistory();
	});

	gmail.onNavigationHistoryChanged((navigationHistory) => {
		ipcRenderer.send(
			main.window.webContents,
			"onNavigationHistoryChanged",
			navigationHistory,
		);
	});

	ipcMain.on("goNavigationHistory", (_event, action) => {
		gmail.go(action);
	});

	ipcMain.on("reload", () => {
		gmail.reload();
	});

	ipcMain.handle("getGmailVisible", () => gmail.visible);

	ipcMain.on("toggleGmailVisible", () => {
		gmail.toggleVisible();
	});

	gmail.onVisibleChanged((visible) => {
		ipcRenderer.send(main.window.webContents, "onGmailVisibleChanged", visible);
	});

	ipcMain.handle("getUnreadMails", () => appState.unreadMails);

	ipcMain.on("gmail.updateUnreadMails", (event, count) => {
		for (const [accountId, view] of gmail.views.entries()) {
			if (view.webContents.id === event.sender.id) {
				appState.unreadMails.set(accountId, count);

				const totalUnreadMails = appState.getTotalUnreadMails();

				if (platform.isMacOS) {
					app.dock.setBadge(
						totalUnreadMails ? totalUnreadMails.toString() : "",
					);
				}

				tray.updateUnreadStatus(totalUnreadMails);

				ipcRenderer.send(
					main.window.webContents,
					"onUnreadMailsChanged",
					appState.unreadMails,
				);

				break;
			}
		}
	});

	if (Notification.isSupported()) {
		ipcMain.on("gmail.receivedNewMails", async (event, mails) => {
			if (!config.get("notifications.enabled")) {
				return;
			}

			for (const mail of mails) {
				for (const [accountId, view] of gmail.views.entries()) {
					if (view.webContents.id === event.sender.id) {
						const account = getAccount(accountId);

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
								: account.label,
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
										"gmail.mail.quickAction",
										mail.messageId,
										"archive",
									);

									break;
								}
								case 1: {
									ipcRenderer.send(
										event.sender,
										"gmail.mail.quickAction",
										mail.messageId,
										"markAsRead",
									);

									break;
								}
								case 2: {
									ipcRenderer.send(
										event.sender,
										"gmail.mail.quickAction",
										mail.messageId,
										"delete",
									);

									break;
								}
								case 3: {
									ipcRenderer.send(
										event.sender,
										"gmail.mail.quickAction",
										mail.messageId,
										"markAsSpam",
									);

									break;
								}
							}
						});

						notification.on("click", () => {
							main.show();

							selectAccount(accountId, gmail);

							ipcRenderer.send(event.sender, "gmail.mail.open", mail.messageId);
						});

						notification.show();

						break;
					}
				}
			}
		});
	}

	ipcMain.handle(
		"getAccountsAttentionRequired",
		() => appState.accountsAttentionRequired,
	);

	appState.onAccountsAttentionRequiredChanged((accountsAttentionRequired) => {
		ipcRenderer.send(
			main.window.webContents,
			"onAccountsAttentionRequiredChanged",
			accountsAttentionRequired,
		);
	});
}
