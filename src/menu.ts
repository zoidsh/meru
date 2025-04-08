import path from "node:path";
import { is, platform } from "@electron-toolkit/utils";
import {
	Menu,
	type MenuItemConstructorOptions,
	app,
	dialog,
	nativeImage,
	nativeTheme,
	session,
	shell,
} from "electron";
import log from "electron-log";
import { accounts } from "./accounts";
import { ipcRenderer } from "./ipc";
import { config } from "./lib/config";
import { GITHUB_REPO_URL } from "./lib/constants";
import { showRestartDialog } from "./lib/dialogs";
import { openExternalUrl } from "./lib/url";
import { main } from "./main";
import { appState } from "./state";
import { appUpdater } from "./updater";

export class AppMenu {
	private _menu: Menu | undefined;

	private _isPopupOpen = false;

	get menu() {
		if (!this._menu) {
			throw new Error("Menu not initialized");
		}

		return this._menu;
	}

	set menu(menu: Menu) {
		this._menu = menu;
	}

	init() {
		this.menu = this.createMenu();

		this.menu.on("menu-will-show", () => {
			this._isPopupOpen = true;
		});

		this.menu.on("menu-will-close", () => {
			this._isPopupOpen = false;
		});

		Menu.setApplicationMenu(this.menu);

		config.onDidChange("accounts", () => {
			this.menu = this.createMenu();

			Menu.setApplicationMenu(this.menu);
		});
	}

	createMenu() {
		const macOSWindowItems: MenuItemConstructorOptions[] = [
			{
				label: `Hide ${app.name}`,
				role: "hide",
			},
			{
				label: "Hide Others",
				role: "hideOthers",
			},
			{
				label: "Show All",
				role: "unhide",
			},
			{
				type: "separator",
			},
		];

		const template: MenuItemConstructorOptions[] = [
			{
				label: app.name,
				submenu: [
					{
						label: `About ${app.name}`,
						click: () => {
							dialog.showMessageBox({
								icon: nativeImage.createFromPath(
									path.join(__dirname, "..", "..", "static", "Icon.png"),
								),
								message: `${app.name}`,
								detail: `Version: ${app.getVersion()}\n\nCreated by Tim Cheung <tim@zoid.sh>\n\nCopyright © ${new Date().getFullYear()} Zoid Ltd`,
							});
						},
					},
					{
						label: "Check for Updates...",
						click: () => {
							appUpdater.checkForUpdates();
						},
					},
					{
						type: "separator",
					},
					{
						label: "Preferences",
						submenu: [
							{
								label: "Confirm External Links before Opening",
								type: "checkbox",
								checked: config.get("externalLinks.confirm"),
								click: ({ checked }: { checked: boolean }) => {
									config.set("externalLinks.confirm", checked);
								},
							},
							{
								label: "Downloads",
								submenu: [
									{
										label: "Show Save As Dialog Before Downloading",
										type: "checkbox",
										checked: config.get("downloads.saveAs"),
										click: ({ checked }) => {
											config.set("downloads.saveAs", checked);

											showRestartDialog();
										},
									},
									{
										label: "Open Folder When Done",
										type: "checkbox",
										checked: config.get("downloads.openFolderWhenDone"),
										click: ({ checked }) => {
											config.set("downloads.openFolderWhenDone", checked);

											showRestartDialog();
										},
									},
									{
										label: "Set Default Location",
										click: async () => {
											const { canceled, filePaths } =
												await dialog.showOpenDialog({
													properties: ["openDirectory"],
													buttonLabel: "Select",
													defaultPath: config.get("downloads.location"),
												});

											if (canceled) {
												return;
											}

											config.set("downloads.location", filePaths[0]);

											showRestartDialog();
										},
									},
								],
							},
							{
								label: "Notifications",
								submenu: [
									{
										label: "Enabled",
										type: "checkbox",
										checked: config.get("notifications.enabled"),
										click({ checked }) {
											config.set("notifications.enabled", checked);
										},
									},
									{
										type: "separator",
									},
									{
										label: "Show Sender",
										type: "checkbox",
										checked: config.get("notifications.showSender"),
										click({ checked }) {
											config.set("notifications.showSender", checked);
										},
									},
									{
										label: "Show Subject",
										type: "checkbox",
										checked: config.get("notifications.showSubject"),
										click({ checked }) {
											config.set("notifications.showSubject", checked);
										},
									},
									{
										label: "Show Summary",
										type: "checkbox",
										visible: platform.isMacOS,
										checked: config.get("notifications.showSummary"),
										click({ checked }) {
											config.set("notifications.showSummary", checked);
										},
									},
									{
										type: "separator",
									},
									{
										label: "Play Sound",
										type: "checkbox",
										checked: config.get("notifications.playSound"),
										click({ checked }) {
											config.set("notifications.playSound", checked);
										},
									},
								],
							},
							{
								label: "Blocker",
								submenu: [
									{
										label: "Enabled",
										type: "checkbox",
										checked: config.get("blocker.enabled"),
										click({ checked }) {
											config.set("blocker.enabled", checked);

											showRestartDialog();
										},
									},
									{
										type: "separator",
									},
									{
										label: "Block Ads",
										type: "checkbox",
										checked: config.get("blocker.ads"),
										click({ checked }) {
											config.set("blocker.ads", checked);

											showRestartDialog();
										},
									},
									{
										label: "Block Tracking",
										type: "checkbox",
										checked: config.get("blocker.tracking"),
										click({ checked }) {
											config.set("blocker.tracking", checked);

											showRestartDialog();
										},
									},
								],
							},
							{
								type: "separator",
							},
							{
								label: "Default Mail Client",
								type: "checkbox",
								checked: app.isDefaultProtocolClient("mailto"),
								click({ checked }) {
									if (checked) {
										const isSetMailClient =
											app.setAsDefaultProtocolClient("mailto");

										dialog.showMessageBox({
											type: "info",
											message: isSetMailClient
												? `${app.name} is now set as default mail client.`
												: `There was a problem with setting ${app.name} as default mail client.`,
										});
									} else {
										const isUnsetMailClient =
											app.removeAsDefaultProtocolClient("mailto");

										dialog.showMessageBox({
											type: "info",
											message: isUnsetMailClient
												? `${app.name} has been removed as default mail client.`
												: `There was a problem with removing ${app.name} as default mail client.`,
										});
									}
								},
							},
							platform.isMacOS
								? {
										label: "Show Menu Bar Icon",
										type: "checkbox",
										checked: config.get("tray.enabled"),
										click: ({ checked }: { checked: boolean }) => {
											config.set("tray.enabled", checked);

											showRestartDialog();
										},
									}
								: {
										label: "System Tray Icon",
										submenu: [
											{
												label: "Enabled",
												type: "checkbox",
												checked: config.get("tray.enabled"),
												click: ({ checked }: { checked: boolean }) => {
													config.set("tray.enabled", checked);

													showRestartDialog();
												},
											},
											{
												label: "Color",
												submenu: [
													{
														label: "Light",
														type: "radio",
														checked: config.get("tray.iconColor") === "light",
														click: () => {
															config.set("tray.iconColor", "light");

															showRestartDialog();
														},
													},
													{
														label: "Dark",
														type: "radio",
														checked: config.get("tray.iconColor") === "dark",
														click: () => {
															config.set("tray.iconColor", "dark");

															showRestartDialog();
														},
													},
												],
											},
										],
									},
							{
								label: "Launch Minimized",
								type: "checkbox",
								checked: config.get("launchMinimized"),
								click({ checked }: { checked: boolean }) {
									config.set("launchMinimized", checked);
								},
							},
							{
								label: "Launch at Login",
								visible: platform.isMacOS || platform.isWindows,
								type: "checkbox",
								checked: app.getLoginItemSettings().openAtLogin,
								click(menuItem) {
									app.setLoginItemSettings({
										openAtLogin: menuItem.checked,
										openAsHidden: menuItem.checked,
									});
								},
							},
							{
								type: "separator",
							},
							{
								label: "Theme",
								submenu: [
									{
										label: "Light",
										type: "radio",
										checked: config.get("theme") === "light",
										click: () => {
											nativeTheme.themeSource = "light";

											config.set("theme", "light");

											if (!platform.isMacOS) {
												showRestartDialog();
											}
										},
									},
									{
										label: "Dark",
										type: "radio",
										checked: config.get("theme") === "dark",
										click: () => {
											nativeTheme.themeSource = "dark";

											config.set("theme", "dark");

											if (!platform.isMacOS) {
												showRestartDialog();
											}
										},
									},
									{
										label: "System",
										type: "radio",
										checked: config.get("theme") === "system",
										click: () => {
											nativeTheme.themeSource = "system";

											config.set("theme", "system");

											if (!platform.isMacOS) {
												showRestartDialog();
											}
										},
									},
								],
							},
							{
								label: "Hardware Acceleration",
								type: "checkbox",
								checked: config.get("hardwareAcceleration"),
								click: ({ checked }: { checked: boolean }) => {
									config.set("hardwareAcceleration", checked);

									showRestartDialog();
								},
							},
							{
								label: "Updates",
								submenu: [
									{
										label: "Check For Updates Automatically",
										type: "checkbox",
										checked: config.get("updates.autoCheck"),
										click: ({ checked }: { checked: boolean }) => {
											config.set("updates.autoCheck", checked);

											showRestartDialog();
										},
									},
								],
							},
						],
					},
					{
						label: "Gmail Settings",
						accelerator: "Command+,",
						click: () => {
							ipcRenderer.send(
								accounts.getSelectedAccount().gmail.view.webContents,
								"navigateTo",
								"settings",
							);

							main.show();
						},
					},
					{
						type: "separator",
					},
					...(platform.isMacOS ? macOSWindowItems : []),
					{
						label: `Quit ${app.name}`,
						accelerator: "CommandOrControl+Q",
						click: () => {
							app.quit();
						},
					},
				],
			},
			{
				role: "fileMenu",
				submenu: [
					{
						label: "Compose",
						click: () => {
							ipcRenderer.send(
								accounts.getSelectedAccount().gmail.view.webContents,
								"navigateTo",
								"compose",
							);

							main.show();
						},
					},
					{
						type: "separator",
					},
					{
						role: "close",
					},
				],
			},
			{
				label: "Accounts",
				submenu: [
					...accounts.getAccounts().map((account, index) => ({
						label: account.config.label,
						click: () => {
							accounts.selectAccount(account.config.id);
						},
						accelerator: `${platform.isLinux ? "Alt" : "CommandOrControl"}+${index + 1}`,
					})),
					{
						type: "separator",
					},
					{
						label: "Select Next Account",
						accelerator: "Ctrl+Tab",
						click: () => {
							accounts.selectNextAccount();

							main.show();
						},
					},
					{
						label: "Select Next Account (hidden shortcut 1)",
						accelerator: "Cmd+Shift+]",
						visible: is.dev,
						acceleratorWorksWhenHidden: true,
						click: () => {
							accounts.selectNextAccount();

							main.show();
						},
					},
					{
						label: "Select Next Account (hidden shortcut 1)",
						accelerator: "Cmd+Option+Right",
						visible: is.dev,
						acceleratorWorksWhenHidden: true,
						click: () => {
							accounts.selectNextAccount();

							main.show();
						},
					},
					{
						label: "Select Previous Account",
						accelerator: "Ctrl+Shift+Tab",
						click: () => {
							accounts.selectPreviousAccount();

							main.show();
						},
					},
					{
						label: "Select Previous Account (hidden shortcut 1)",
						accelerator: "Cmd+Shift+[",
						visible: is.dev,
						acceleratorWorksWhenHidden: true,
						click: () => {
							accounts.selectPreviousAccount();

							main.show();
						},
					},
					{
						label: "Select Previous Account (hidden shortcut 2)",
						accelerator: "Cmd+Option+Left",
						visible: is.dev,
						acceleratorWorksWhenHidden: true,
						click: () => {
							accounts.selectPreviousAccount();

							main.show();
						},
					},
					{
						type: "separator",
					},
					{
						label: "Manage Accounts",
						click: () => {
							appState.setIsSettingsOpen(true);

							accounts.hide();

							main.show();
						},
					},
				],
			},
			{
				role: "editMenu",
				submenu: [
					{
						role: "undo",
					},
					{
						role: "redo",
					},
					{
						type: "separator",
					},
					{
						role: "cut",
					},
					{
						role: "copy",
					},
					{
						role: "paste",
					},
					{
						role: "pasteAndMatchStyle",
						accelerator: "CommandOrControl+Shift+V",
					},
					{
						role: "delete",
					},
					{
						role: "selectAll",
					},
					{
						type: "separator",
					},
					{
						label: "Speech",
						submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }],
					},
				],
			},
			{
				label: "View",
				submenu: [
					{
						label: "Reload",
						accelerator: "CommandOrControl+R",
						click: () => {
							accounts.getSelectedAccount().gmail.view.webContents.reload();

							main.show();
						},
					},
					{
						label: "Full Reload",
						accelerator: "CommandOrControl+Shift+R",
						click: () => {
							main.window.webContents.reload();

							main.show();
						},
					},
					{
						label: "Developer Tools",
						accelerator: platform.isMacOS ? "Command+Alt+I" : "Control+Shift+I",
						click: () => {
							main.window.webContents.openDevTools({ mode: "detach" });

							accounts
								.getSelectedAccount()
								.gmail.view.webContents.openDevTools();

							main.show();
						},
					},
					{
						type: "separator",
					},
					{
						label: "Reset Zoom",
						accelerator: "CommandOrControl+0",
						click: () => {
							const zoomFactor = 1;

							for (const [_accountId, gmail] of accounts.gmails) {
								gmail.view.webContents.setZoomFactor(zoomFactor);
							}

							config.set("gmail.zoomFactor", zoomFactor);
						},
					},
					{
						label: "Zoom In",
						accelerator: "CommandOrControl+Plus",
						click: () => {
							const zoomFactor = config.get("gmail.zoomFactor") + 0.1;

							for (const [_accountId, gmail] of accounts.gmails) {
								gmail.view.webContents.setZoomFactor(zoomFactor);
							}

							config.set("gmail.zoomFactor", zoomFactor);
						},
					},
					{
						label: "Zoom Out",
						accelerator: "CommandOrControl+-",
						click: () => {
							const zoomFactor = config.get("gmail.zoomFactor") - 0.1;

							if (zoomFactor > 0) {
								for (const [_accountId, gmail] of accounts.gmails) {
									gmail.view.webContents.setZoomFactor(zoomFactor);
								}

								config.set("gmail.zoomFactor", zoomFactor);
							}
						},
					},
				],
			},
			{
				label: "Go",
				submenu: [
					{
						type: "separator",
					},
					{
						label: "Inbox",
						click: () => {
							ipcRenderer.send(
								accounts.getSelectedAccount().gmail.view.webContents,
								"navigateTo",
								"inbox",
							);

							main.show();
						},
					},
					{
						label: "Important",
						click: () => {
							ipcRenderer.send(
								accounts.getSelectedAccount().gmail.view.webContents,
								"navigateTo",
								"imp",
							);

							main.show();
						},
					},
					{
						label: "Snoozed",
						click: () => {
							ipcRenderer.send(
								accounts.getSelectedAccount().gmail.view.webContents,
								"navigateTo",
								"snoozed",
							);

							main.show();
						},
					},
					{
						label: "Starred",
						click: () => {
							ipcRenderer.send(
								accounts.getSelectedAccount().gmail.view.webContents,
								"navigateTo",
								"starred",
							);

							main.show();
						},
					},
					{
						type: "separator",
					},
					{
						label: "Drafts",
						click: () => {
							ipcRenderer.send(
								accounts.getSelectedAccount().gmail.view.webContents,
								"navigateTo",
								"drafts",
							);

							main.show();
						},
					},
					{
						label: "Scheduled",
						click: () => {
							ipcRenderer.send(
								accounts.getSelectedAccount().gmail.view.webContents,
								"navigateTo",
								"scheduled",
							);

							main.show();
						},
					},
					{
						label: "Sent",
						click: () => {
							ipcRenderer.send(
								accounts.getSelectedAccount().gmail.view.webContents,
								"navigateTo",
								"sent",
							);

							main.show();
						},
					},
					{
						label: "Spam",
						click: () => {
							ipcRenderer.send(
								accounts.getSelectedAccount().gmail.view.webContents,
								"navigateTo",
								"spam",
							);

							main.show();
						},
					},
					{
						label: "Bin",
						click: () => {
							ipcRenderer.send(
								accounts.getSelectedAccount().gmail.view.webContents,
								"navigateTo",
								"trash",
							);

							main.show();
						},
					},
					{
						type: "separator",
					},
					{
						label: "All Mail",
						click: () => {
							ipcRenderer.send(
								accounts.getSelectedAccount().gmail.view.webContents,
								"navigateTo",
								"all",
							);

							main.show();
						},
					},
				],
			},
			{
				label: "Window",
				role: "window",
				submenu: [
					{
						label: "Minimize",
						accelerator: "CommandOrControl+M",
						role: "minimize",
					},
					{
						label: "Close",
						accelerator: "CommandOrControl+W",
						role: "close",
					},
				],
			},
			{
				label: "Help",
				role: "help",
				submenu: [
					{
						label: "Website",
						click: () => {
							openExternalUrl(GITHUB_REPO_URL);
						},
					},
					{
						label: "Release Notes",
						click: () => {
							openExternalUrl(`${GITHUB_REPO_URL}/releases`);
						},
					},
					{
						label: "Source Code",
						click: () => {
							openExternalUrl(GITHUB_REPO_URL);
						},
					},
					{
						type: "separator",
					},
					{
						label: "Gmail Keyboard Shortcuts",
						click: () => {
							openExternalUrl("https://support.google.com/mail/answer/6594");
						},
					},
					{
						type: "separator",
					},
					{
						label: "Ask Questions",
						click: () => {
							openExternalUrl(`${GITHUB_REPO_URL}/discussions/categories/q-a`);
						},
					},
					{
						label: "Request Features",
						click: () => {
							openExternalUrl(
								`${GITHUB_REPO_URL}/discussions/categories/feature-requests`,
							);
						},
					},
					{
						type: "separator",
					},
					{
						label: "Report Issue",
						click: () => {
							openExternalUrl(`${GITHUB_REPO_URL}/issues/new/choose`);
						},
					},
					{
						label: "Troubleshooting",
						submenu: [
							{
								label: "Edit Config",
								click: () => {
									config.openInEditor();
								},
							},
							{
								label: "Reset Config",
								click: () => {
									config.set("resetConfig", true);

									showRestartDialog();
								},
							},
							{
								type: "separator",
							},
							{
								label: "Clear Cache",
								click: () => {
									for (const account of accounts.getAccounts()) {
										session
											.fromPartition(`persist:${account.config.id}`)
											.clearCache();
									}

									showRestartDialog();
								},
							},
							{
								label: "Reset App Data",
								click: () => {
									for (const account of accounts.getAccounts()) {
										session
											.fromPartition(`persist:${account.config.id}`)
											.clearStorageData();
									}

									config.clear();

									showRestartDialog();
								},
							},
							{
								type: "separator",
							},
							{
								label: "View Logs",
								click: () => {
									shell.openPath(log.transports.file.getFile().path);
								},
							},
						],
					},
				],
			},
		];

		return Menu.buildFromTemplate(template);
	}

	togglePopup() {
		if (this._isPopupOpen) {
			this.menu.closePopup(main.window);
		} else {
			this.menu.popup({
				window: main.window,
			});
		}
	}
}

export const appMenu = new AppMenu();
