import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/main";
import { platform } from "@electron-toolkit/utils";
import type { IpcMainEvents, IpcRendererEvent } from "@meru/shared/types";
import { arrayMove, extractVerificationCodeFromText } from "@meru/shared/utils";
import {
	clipboard,
	desktopCapturer,
	Notification,
	nativeImage,
	shell,
} from "electron";
import { accounts } from "@/accounts";
import { config } from "@/config";
import { licenseKey } from "@/license-key";
import { main } from "@/main";
import { appMenu } from "@/menu";
import { appState } from "@/state";
import { createNotification } from "./notifications";
import { appUpdater } from "./updater";
import { openExternalUrl } from "./url";

class Ipc {
	main = new IpcListener<IpcMainEvents>();

	renderer = new IpcEmitter<IpcRendererEvent>();

	init() {
		this.main.on("settings.toggleIsOpen", () => {
			appState.toggleIsSettingsOpen();

			if (appState.isSettingsOpen) {
				accounts.hide();
			} else {
				accounts.show();
			}
		});

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

		this.main.on("accounts.selectPreviousAccount", () => {
			accounts.selectPreviousAccount();
		});

		this.main.on("accounts.selectNextAccount", () => {
			accounts.selectNextAccount();
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

		if (Notification.isSupported()) {
			this.main.on("gmail.handleNewMessages", async (event, mails) => {
				if (!config.get("notifications.enabled")) {
					return;
				}

				for (const mail of mails) {
					for (const [accountId, instance] of accounts.instances) {
						if (instance.gmail.view.webContents.id === event.sender.id) {
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

							if (
								licenseKey.isValid &&
								config.get("verificationCodes.autoCopy")
							) {
								const verificationCode =
									(subtitle && extractVerificationCodeFromText(subtitle)) ||
									(body && extractVerificationCodeFromText(body));

								if (verificationCode) {
									clipboard.writeText(verificationCode);

									createNotification({
										title: config.get("notifications.showSender")
											? mail.sender.name
											: account.config.label,
										body: `Verification code ${verificationCode} copied.`,
									});

									if (config.get("verificationCodes.autoDelete")) {
										this.renderer.send(
											event.sender,
											"gmail.handleMessage",
											mail.messageId,
											"delete",
										);
									}

									return;
								}
							}

							createNotification({
								title: config.get("notifications.showSender")
									? mail.sender.name
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
										mail.messageId,
									);
								},
								action: (index) => {
									switch (index) {
										case 0: {
											this.renderer.send(
												event.sender,
												"gmail.handleMessage",
												mail.messageId,
												"archive",
											);

											break;
										}
										case 1: {
											this.renderer.send(
												event.sender,
												"gmail.handleMessage",
												mail.messageId,
												"markAsRead",
											);

											break;
										}
										case 2: {
											this.renderer.send(
												event.sender,
												"gmail.handleMessage",
												mail.messageId,
												"delete",
											);

											break;
										}
										case 3: {
											this.renderer.send(
												event.sender,
												"gmail.handleMessage",
												mail.messageId,
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

		ipc.main.handle("downloads.getHistory", () =>
			config.get("downloads.history"),
		);

		ipc.main.handle("downloads.openFile", async (_event, filePath) => {
			const error = await shell.openPath(filePath);

			return {
				error: error
					? fs.existsSync(filePath)
						? error
						: "File does not exist"
					: null,
			};
		});

		ipc.main.handle("downloads.showFileInFolder", (_event, filePath) => {
			if (!fs.existsSync(filePath)) {
				return {
					error: "File does not exist",
				};
			}

			shell.showItemInFolder(filePath);

			return { error: null };
		});

		ipc.main.on("downloads.removeHistoryItem", (_event, itemId) => {
			config.set(
				"downloads.history",
				config.get("downloads.history").filter((item) => item.id !== itemId),
			);
		});

		ipc.main.on("downloads.clearHistory", () => {
			config.set("downloads.history", []);
		});

		config.onDidChange("downloads.history", (downloadHistory) => {
			if (downloadHistory) {
				ipc.renderer.send(
					main.window.webContents,
					"downloads.historyChanged",
					downloadHistory,
				);
			}
		});

		ipc.main.on("taskbar.setOverlayIcon", (_event, dataUrl) => {
			main.window.setOverlayIcon(
				nativeImage.createFromDataURL(dataUrl),
				"You have unread messages",
			);
		});

		ipc.main.on("appUpdater.quitAndInstall", () => {
			appUpdater.quitAndInstall();
		});

		ipc.main.on("appUpdater.openReleaseNotes", (_event, version) => {
			openExternalUrl(
				`https://github.com/zoidsh/meru/releases/tag/v${version}`,
				true,
			);
		});

		ipc.main.handle("gmail.getSavedSearches", () =>
			config.get("gmail.savedSearches"),
		);

		ipc.main.on("gmail.addSavedSearch", (_event, savedSearch) => {
			const updatedSavedSearches = [
				...config.get("gmail.savedSearches"),
				{ id: randomUUID(), ...savedSearch },
			];

			config.set("gmail.savedSearches", updatedSavedSearches);
		});

		ipc.main.on("gmail.search", (_event, searchQuery) => {
			const selectedAccount = accounts.getSelectedAccount();

			selectedAccount.instance.gmail.search(searchQuery);
		});

		ipc.main.on("gmail.moveSavedSearch", (_event, moveSavedSearchId, move) => {
			const savedSearches = config.get("gmail.savedSearches");

			const savedSearchIndex = savedSearches.findIndex(
				(savedSearch) => savedSearch.id === moveSavedSearchId,
			);

			config.set(
				"gmail.savedSearches",
				arrayMove(
					savedSearches,
					savedSearchIndex,
					move === "up" ? savedSearchIndex - 1 : savedSearchIndex + 1,
				),
			);
		});

		ipc.main.on("gmail.updateSavedSearch", (_event, updatedSavedSearch) => {
			config.set(
				"gmail.savedSearches",
				config
					.get("gmail.savedSearches")
					.map((savedSearch) =>
						savedSearch.id === updatedSavedSearch.id
							? updatedSavedSearch
							: savedSearch,
					),
			);
		});

		ipc.main.on("gmail.deleteSavedSearch", (_event, deleteSavedSearchId) => {
			config.set(
				"gmail.savedSearches",
				config
					.get("gmail.savedSearches")
					.filter((savedSearch) => savedSearch.id !== deleteSavedSearchId),
			);
		});

		config.onDidChange("gmail.savedSearches", (savedSearches) => {
			if (savedSearches) {
				ipc.renderer.send(
					main.window.webContents,
					"gmail.savedSearchesChanged",
					savedSearches,
				);
			}
		});

		ipc.main.handle("verificationCodes.getConfig", () => ({
			autoCopy: config.get("verificationCodes.autoCopy"),
			autoDelete: config.get("verificationCodes.autoDelete"),
		}));

		ipc.main.handle("verificationCodes.setAutoCopy", (_event, value) => {
			config.set("verificationCodes.autoCopy", value);
		});

		ipc.main.handle("verificationCodes.setAutoDelete", (_event, value) => {
			config.set("verificationCodes.autoDelete", value);
		});
	}
}

export const ipc = new Ipc();
