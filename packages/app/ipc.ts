import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/main";
import { platform } from "@electron-toolkit/utils";
import type { IpcMainEvents, IpcRendererEvent } from "@meru/shared/types";
import { desktopCapturer, Notification } from "electron";
import { accounts } from "@/accounts";
import { config } from "@/config";
import { licenseKey } from "@/license-key";
import { main } from "@/main";
import { appMenu } from "@/menu";
import { createNotification } from "./notifications";

class Ipc {
	main = new IpcListener<IpcMainEvents>();

	renderer = new IpcEmitter<IpcRendererEvent>();

	init() {
		config.onDidChange("accounts", () => {
			this.renderer.send(
				main.window.webContents,
				"accounts.changed",
				accounts.getAccounts().map((account) => ({
					config: account.config,
					gmail: {
						...account.instance.gmail.store.getState(),
						...account.instance.gmail.viewStore.getState(),
					},
				})),
			);
		});

		this.main.on("accounts.selectAccount", (_event, selectedAccountId) => {
			accounts.selectAccount(selectedAccountId);
		});

		this.main.on("accounts.addAccount", (_event, accountDetails) => {
			accounts.addAccount(accountDetails);
		});

		this.main.on("accounts.removeAccount", (_event, selectedAccountId) => {
			accounts.removeAccount(selectedAccountId);
		});

		this.main.on("accounts.updateAccount", (_event, updatedAccount) => {
			accounts.updateAccount(updatedAccount);
		});

		this.main.on(
			"accounts.moveAccount",
			(_event, movedAccountId, direction) => {
				accounts.moveAccount(movedAccountId, direction);
			},
		);

		this.main.on("accounts.openMessage", (_event, accountId, messageId) => {
			accounts.selectAccount(accountId);

			const account = accounts.getAccount(accountId);

			account.instance.gmail.view.webContents.send(
				"gmail.openMessage",
				messageId,
			);
		});

		this.main.on(
			"accounts.handleMessage",
			(_event, accountId, messageId, action) => {
				const account = accounts.getAccount(accountId);

				account.instance.gmail.view.webContents.send(
					"gmail.handleMessage",
					messageId,
					action,
				);
			},
		);

		this.main.on("gmail.moveNavigationHistory", (_event, action) => {
			accounts
				.getSelectedAccount()
				.instance.gmail.view.webContents.navigationHistory[
					action === "back" ? "goBack" : "goForward"
				]();
		});

		this.main.on("gmail.setUnreadCount", (event, unreadCount) => {
			for (const accountInstance of accounts.instances.values()) {
				if (event.sender.id === accountInstance.gmail.view.webContents.id) {
					accountInstance.gmail.setUnreadCount(unreadCount);
				}
			}
		});

		this.main.on("gmail.updateFeed", (event, feed) => {
			for (const accountInstance of accounts.instances.values()) {
				if (event.sender.id === accountInstance.gmail.view.webContents.id) {
					accountInstance.gmail.store.setState({ feed });
				}
			}
		});

		this.main.on("titleBar.toggleAppMenu", () => {
			appMenu.togglePopup();
		});

		this.main.handle("licenseKey.activate", (_event, input) =>
			licenseKey.activate({ licenseKey: input }),
		);

		this.main.handle("desktopSources.getSources", async () => {
			const desktopSources = await desktopCapturer.getSources({
				types: ["screen", "window"],
			});

			return desktopSources
				.filter((source) => !source.name.startsWith("Choose what to share"))
				.map(({ id, name, thumbnail }) => ({
					id,
					name,
					thumbnail: thumbnail.toDataURL(),
				}));
		});

		this.main.on("findInPage", (_event, text, options) => {
			const selectedAccount = accounts.getSelectedAccount();

			if (!text) {
				selectedAccount.instance.gmail.view.webContents.stopFindInPage(
					"clearSelection",
				);

				return;
			}

			selectedAccount.instance.gmail.view.webContents.findInPage(text, {
				forward: options?.forward,
				findNext: options?.findNext,
			});
		});

		this.main.on("accounts.show", () => {
			accounts.show();
		});

		this.main.on("accounts.hide", () => {
			accounts.hide();
		});

		if (Notification.isSupported()) {
			this.main.on("gmail.notifyNewMessages", async (event, messages) => {
				if (!config.get("notifications.enabled")) {
					return;
				}

				for (const message of messages) {
					for (const [accountId, instance] of accounts.instances) {
						if (instance.gmail.view.webContents.id === event.sender.id) {
							const account = accounts.getAccount(accountId);

							if (!account.config.notifications) {
								break;
							}

							let subtitle: string | undefined;

							if (platform.isMacOS && config.get("notifications.showSubject")) {
								subtitle = message.subject;
							}

							let body: string | undefined;

							if (platform.isMacOS && config.get("notifications.showSummary")) {
								body = message.summary;
							} else if (
								!platform.isMacOS &&
								config.get("notifications.showSubject")
							) {
								body = message.subject;
							}

							createNotification({
								title: config.get("notifications.showSender")
									? message.sender.name
									: account.config.label,
								subtitle,
								body,
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
								click: () => {
									main.show();

									accounts.selectAccount(accountId);

									this.renderer.send(
										event.sender,
										"gmail.openMessage",
										message.id,
									);
								},
								action: (index) => {
									switch (index) {
										case 0: {
											this.renderer.send(
												event.sender,
												"gmail.handleMessage",
												message.id,
												"archive",
											);

											break;
										}
										case 1: {
											this.renderer.send(
												event.sender,
												"gmail.handleMessage",
												message.id,
												"markAsRead",
											);

											break;
										}
										case 2: {
											this.renderer.send(
												event.sender,
												"gmail.handleMessage",
												message.id,
												"delete",
											);

											break;
										}
										case 3: {
											this.renderer.send(
												event.sender,
												"gmail.handleMessage",
												message.id,
												"markAsSpam",
											);

											break;
										}
									}
								},
							});

							break;
						}
					}
				}
			});
		}
	}
}

export const ipc = new Ipc();
