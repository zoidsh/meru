import fs from "node:fs";
import path from "node:path";
import { is, platform } from "@electron-toolkit/utils";
import { GITHUB_REPO_URL, WEBSITE_URL } from "@meru/shared/constants";
import {
	app,
	dialog,
	Menu,
	type MenuItemConstructorOptions,
	nativeImage,
	nativeTheme,
	session,
	shell,
} from "electron";
import log from "electron-log";
import { accounts } from "@/accounts";
import { config } from "@/config";
import { showRestartDialog } from "@/dialogs";
import { GMAIL_USER_STYLES_PATH } from "@/gmail";
import { ipc } from "@/ipc";
import { main } from "@/main";
import { appState } from "@/state";
import { appUpdater } from "@/updater";
import { openExternalUrl } from "@/url";
import { licenseKey } from "./license-key";

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

		const zoomIn = () => {
			const zoomFactor = config.get("gmail.zoomFactor") + 0.1;

			for (const [_accountId, instance] of accounts.instances) {
				instance.gmail.view.webContents.setZoomFactor(zoomFactor);
			}

			config.set("gmail.zoomFactor", zoomFactor);
		};

		const zoomOut = () => {
			const zoomFactor = config.get("gmail.zoomFactor") - 0.1;

			if (zoomFactor > 0) {
				for (const [_accountId, instance] of accounts.instances) {
					instance.gmail.view.webContents.setZoomFactor(zoomFactor);
				}

				config.set("gmail.zoomFactor", zoomFactor);
			}
		};

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
								detail: `Version: ${app.getVersion()}\n\nCreated by Tim Cheung <tim@meru.so>\n\nCopyright © ${new Date().getFullYear()} Meru`,
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
						label: "Settings",
						submenu: [
							{
								label: "Accounts",
								submenu: [
									{
										label: "Show Unread Badge",
										type: "checkbox",
										checked: config.get("accounts.unreadBadge"),
										click: ({ checked }: { checked: boolean }) => {
											config.set("accounts.unreadBadge", checked);

											showRestartDialog();
										},
									},
									{
										type: "separator",
									},
									{
										label: "Manage Accounts...",
										click: () => {
											appState.setIsSettingsOpen(true);

											main.navigate("/accounts");

											accounts.hide();

											main.show();
										},
									},
								],
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
										label: "Allow from Google Apps",
										enabled: licenseKey.isValid,
										type: "checkbox",
										checked: config.get("notifications.allowFromGoogleApps"),
										click({ checked }) {
											config.set("notifications.allowFromGoogleApps", checked);

											dialog.showMessageBox({
												type: "info",
												message: "Ensure notifications in Gmail are disabled",
												detail:
													"To avoid duplicate notifications, please disable notifications in your Gmail settings.",
											});

											showRestartDialog();
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
									{
										label: "Sound",
										enabled: licenseKey.isValid,
										submenu: (
											[
												{ value: "bell", label: "Bell" },
												{ value: "bubble", label: "Bubble" },
												{ value: "long-pop", label: "Long Pop" },
												{ value: "magic-marimba", label: "Magic Marimba" },
												{ value: "magic-ring", label: "Magic Ring" },
												{ value: "retro-game", label: "Retro Game" },
												{ value: "system", label: "System" },
											] as const
										).map(({ value, label }) => ({
											label,
											type: "radio" as const,
											checked: config.get("notifications.sound") === value,
											click: () => {
												config.set("notifications.sound", value);

												if (value !== "system") {
													ipc.renderer.send(
														main.window.webContents,
														"notifications.playSound",
														value,
													);
												}
											},
										})),
									},
								],
							},
							{
								label: "Blocker",
								enabled: licenseKey.isValid,
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
								label: "Phishing Protection",
								enabled: licenseKey.isValid,
								submenu: [
									{
										label: "Confirm External Links before Opening",
										type: "checkbox",
										checked: config.get("externalLinks.confirm"),
										click: ({ checked }: { checked: boolean }) => {
											config.set("externalLinks.confirm", checked);
										},
									},
								],
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
								label: "Google Apps",
								enabled: licenseKey.isValid,
								submenu: [
									{
										label: "Open in External Browser",
										type: "checkbox",
										checked: config.get("googleApps.openInExternalBrowser"),
										click: ({ checked }: { checked: boolean }) => {
											config.set("googleApps.openInExternalBrowser", checked);
										},
									},
								],
							},
							{
								label: "Saved Searches...",
								enabled: licenseKey.isValid,
								click: () => {
									appState.setIsSettingsOpen(true);

									main.navigate("/saved-searches");

									accounts.hide();

									main.show();
								},
							},
							{
								type: "separator",
							},
							...(platform.isMacOS
								? [
										{
											label: "Dock Icon",
											submenu: [
												{
													label: "Enabled",
													type: "checkbox",
													checked: config.get("dock.enabled"),
													click: ({ checked }: { checked: boolean }) => {
														config.set("dock.enabled", checked);

														showRestartDialog();
													},
												},
												{
													type: "separator",
												},
												{
													label: "Show Unread Badge",
													type: "checkbox",
													checked: config.get("dock.unreadBadge"),
													click: ({ checked }: { checked: boolean }) => {
														config.set("dock.unreadBadge", checked);

														showRestartDialog();
													},
												},
											],
										} satisfies MenuItemConstructorOptions,
									]
								: []),
							platform.isMacOS
								? {
										label: "Menu Bar Icon",
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
												type: "separator",
											},
											{
												label: "Show Unread Count",
												type: "checkbox",
												checked: config.get("tray.unreadCount"),
												click: ({ checked }: { checked: boolean }) => {
													config.set("tray.unreadCount", checked);

													showRestartDialog();
												},
											},
										],
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
														label: "System",
														type: "radio",
														checked: config.get("tray.iconColor") === "system",
														click: () => {
															config.set("tray.iconColor", "system");

															showRestartDialog();
														},
													},
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
								type: "separator",
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
								label: "Launch Minimized",
								type: "checkbox",
								checked: config.get("launchMinimized"),
								click({ checked }: { checked: boolean }) {
									config.set("launchMinimized", checked);
								},
							},
							{
								type: "separator",
							},
							{
								label: "Set as Default Mail Client",
								enabled: licenseKey.isValid,
								type: "checkbox",
								checked: app.isDefaultProtocolClient("mailto"),
								click: () => {
									if (process.defaultApp) {
										if (process.argv.length >= 2) {
											if (!process.argv[1]) {
												throw new Error('Could not find "process.argv[1]"');
											}

											app.setAsDefaultProtocolClient(
												"mailto",
												process.execPath,
												[path.resolve(process.argv[1])],
											);
										}
									} else {
										app.setAsDefaultProtocolClient("mailto");
									}
								},
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
								label: "Window",
								submenu: [
									{
										label: "Restrict Minimum Size",
										type: "checkbox",
										checked: config.get("window.restrictMinimumSize"),
										click: ({ checked }: { checked: boolean }) => {
											config.set("window.restrictMinimumSize", checked);

											showRestartDialog();
										},
									},
								],
							},
							{
								label: "Screen Share",
								visible: platform.isMacOS,
								enabled: licenseKey.isValid,
								submenu: [
									{
										label: "Use System Picker",
										type: "checkbox",
										checked: config.get("screenShare.useSystemPicker"),
										click: ({ checked }) => {
											config.set("screenShare.useSystemPicker", checked);

											showRestartDialog();
										},
									},
								],
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
									{
										label: "Show Update Notifications",
										type: "checkbox",
										checked: config.get("updates.showNotifications"),
										click: ({ checked }: { checked: boolean }) => {
											config.set("updates.showNotifications", checked);
										},
									},
								],
							},
							{
								type: "separator",
							},
							{
								label: "Manage License...",
								click: () => {
									appState.setIsSettingsOpen(true);

									main.navigate("/license");

									accounts.hide();

									main.show();
								},
							},
						],
					},
					{
						label: "Gmail Settings...",
						accelerator: "Command+,",
						click: () => {
							ipc.renderer.send(
								accounts.getSelectedAccount().instance.gmail.view.webContents,
								"gmail.navigateTo",
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
							ipc.renderer.send(
								accounts.getSelectedAccount().instance.gmail.view.webContents,
								"gmail.navigateTo",
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
						label: "Find...",
						accelerator: "CommandOrControl+F",
						click: () => {
							ipc.renderer.send(main.window.webContents, "findInPage.activate");

							main.window.webContents.focus();
						},
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
						label: "Gmail Appearance",
						submenu: [
							{
								label: "Hide Gmail Logo",
								type: "checkbox",
								checked: config.get("gmail.hideGmailLogo"),
								click: ({ checked }: { checked: boolean }) => {
									config.set("gmail.hideGmailLogo", checked);

									showRestartDialog();
								},
							},
							{
								label: "Hide Inbox Footer",
								type: "checkbox",
								checked: config.get("gmail.hideInboxFooter"),
								click: ({ checked }: { checked: boolean }) => {
									config.set("gmail.hideInboxFooter", checked);

									showRestartDialog();
								},
							},
							{
								label: "Reverse Conversation",
								type: "checkbox",
								enabled: licenseKey.isValid,
								checked: config.get("gmail.reverseConversation"),
								click: ({ checked }: { checked: boolean }) => {
									config.set("gmail.reverseConversation", checked);

									showRestartDialog();
								},
							},
							{
								type: "separator",
							},
							{
								label: "Edit User Styles",
								enabled: licenseKey.isValid,
								click: () => {
									if (!fs.existsSync(GMAIL_USER_STYLES_PATH)) {
										fs.closeSync(fs.openSync(GMAIL_USER_STYLES_PATH, "w"));
									}

									shell.openPath(GMAIL_USER_STYLES_PATH);
								},
							},
						],
					},
					{
						type: "separator",
					},
					{
						label: "Downloads",
						accelerator: "CommandOrControl+Alt+L",
						click: () => {
							main.navigate("/download-history");

							appState.setIsSettingsOpen(true);

							accounts.hide();

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

							for (const [_accountId, instance] of accounts.instances) {
								instance.gmail.view.webContents.setZoomFactor(zoomFactor);
							}

							config.set("gmail.zoomFactor", zoomFactor);
						},
					},
					{
						label: "Zoom In",
						accelerator: "CommandOrControl+Plus",
						click: zoomIn,
					},
					{
						label: "Zoom In (hidden shortcut 1)",
						visible: is.dev,
						acceleratorWorksWhenHidden: true,
						accelerator: "CommandOrControl+numadd",
						click: zoomIn,
					},
					{
						label: "Zoom Out",
						accelerator: "CommandOrControl+-",
						click: zoomOut,
					},
					{
						label: "Zoom Out (hidden shortcut 1)",
						accelerator: "CommandOrControl+numsub",
						click: zoomOut,
					},
					{
						type: "separator",
					},
					{
						label: "Reload",
						accelerator: "CommandOrControl+R",
						click: () => {
							accounts
								.getSelectedAccount()
								.instance.gmail.view.webContents.reload();

							main.show();
						},
					},
					{
						label: "Full Reload",
						accelerator: "CommandOrControl+Shift+R",
						click: () => {
							main.show();

							main.loadURL();

							for (const account of accounts.getAccounts()) {
								account.instance.gmail.view.webContents.reload();
							}
						},
					},
					{
						type: "separator",
					},
					{
						label: "Developer Tools",
						accelerator: platform.isMacOS ? "Command+Alt+I" : "Control+Shift+I",
						click: () => {
							main.window.webContents.openDevTools({ mode: "detach" });

							accounts
								.getSelectedAccount()
								.instance.gmail.view.webContents.openDevTools();

							main.show();
						},
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
						accelerator: "Command+Shift+]",
						visible: is.dev,
						acceleratorWorksWhenHidden: true,
						click: () => {
							accounts.selectNextAccount();

							main.show();
						},
					},
					{
						label: "Select Next Account (hidden shortcut 2)",
						accelerator: "Command+Option+Right",
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
						accelerator: "Command+Shift+[",
						visible: is.dev,
						acceleratorWorksWhenHidden: true,
						click: () => {
							accounts.selectPreviousAccount();

							main.show();
						},
					},
					{
						label: "Select Previous Account (hidden shortcut 2)",
						accelerator: "Command+Option+Left",
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
						label: "Manage Accounts...",
						click: () => {
							appState.setIsSettingsOpen(true);

							main.navigate("/accounts");

							accounts.hide();

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
							openExternalUrl(WEBSITE_URL);
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
