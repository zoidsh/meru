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
import type { Gmail } from "./gmail";
import {
	selectAccount,
	selectNextAccount,
	selectPreviousAccount,
} from "./lib/accounts";
import { config } from "./lib/config";
import { GITHUB_REPO_URL } from "./lib/constants";
import { openExternalUrl } from "./lib/url";
import type { Main } from "./main";

export class AppMenu {
	menu: Menu;

	main: Main;
	gmail: Gmail;

	constructor({ main, gmail }: { main: Main; gmail: Gmail }) {
		this.main = main;
		this.gmail = gmail;

		this.menu = this.createMenu();

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
									path.join(__dirname, "..", "..", "static", "icon.png"),
								),
								message: `${app.name}`,
								detail: `Version: ${app.getVersion()}\n\nCreated by Tim Cheung <tim@cheung.io>\n\nCopyright © 2025 Tim Cheung`,
							});
						},
					},
					{
						label: "Check for Updates...",
						click: () => {
							// @TODO
							// checkForUpdatesWithFeedback();
						},
					},
					{
						type: "separator",
					},
					{
						label: "Preferences",
						submenu: [
							{
								label: "Hide Menu bar",
								visible: !platform.isMacOS,
								type: "checkbox",
								checked: config.get("autoHideMenuBar"),
								click: ({ checked }) => {
									config.set("autoHideMenuBar", checked);

									this.main.window.setMenuBarVisibility(!checked);
									this.main.window.autoHideMenuBar = checked;

									if (checked) {
										dialog.showMessageBox({
											type: "info",
											buttons: ["OK"],
											message:
												"Tip: You can press the Alt key to see the menu bar again.",
										});
									}
								},
							},
							{
								label: "Title Bar Style",
								visible: platform.isLinux,
								submenu: [
									{
										label: "App",
										type: "radio",
										checked: config.get("titleBarStyle") === "app",
										click: () => {
											config.set("titleBarStyle", "app");

											this.showRestartDialog();
										},
									},
									{
										label: "System",
										type: "radio",
										checked: config.get("titleBarStyle") === "system",
										click: () => {
											config.set("titleBarStyle", "system");

											this.showRestartDialog();
										},
									},
								],
							},
							{
								label: "Confirm External Links before Opening",
								type: "checkbox",
								checked: config.get("app.confirmExternalLink"),
								click: ({ checked }: { checked: boolean }) => {
									config.set("app.confirmExternalLink", checked);
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
											config.set("downloadsSaveAs", checked);

											this.showRestartDialog();
										},
									},
									{
										label: "Open Folder When Done",
										type: "checkbox",
										checked: config.get("downloads.openFolderWhenDone"),
										click: ({ checked }) => {
											config.set("downloads.openFolderWhenDone", checked);

											this.showRestartDialog();
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

											this.showRestartDialog();
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
							{
								label: platform.isMacOS
									? "Show Menu Bar Icon"
									: "Show System Tray Icon",
								type: "checkbox",
								checked: config.get("trayIcon.enabled"),
								click: ({ checked }: { checked: boolean }) => {
									config.set("trayIcon.enabled", checked);

									this.showRestartDialog();
								},
							},
							{
								label: "Launch Minimized",
								type: "checkbox",
								checked: config.get("app.launchMinimized"),
								click({ checked }: { checked: boolean }) {
									config.set("app.launchMinimized", checked);
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
								label: "Hardware Acceleration",
								type: "checkbox",
								checked: config.get("app.hardwareAcceleration"),
								click: ({ checked }: { checked: boolean }) => {
									config.set("app.hardwareAcceleration", checked);

									this.showRestartDialog();
								},
							},
							{
								label: "Blocker",
								submenu: [
									{
										label: "Enabled",
										type: "checkbox",
										checked: config.get("blocker.enabled"),
										click: ({ checked }) => {
											config.set("blocker.enabled", checked);

											this.showRestartDialog();
										},
									},
									{
										type: "separator",
									},
									{
										label: "Block Ads",
										type: "checkbox",
										checked: config.get("blocker.ads"),
										click: ({ checked }) => {
											config.set("blocker.ads", checked);

											this.showRestartDialog();
										},
									},
									{
										label: "Block Analytics",
										type: "checkbox",
										checked: config.get("blocker.analytics"),
										click: ({ checked }) => {
											config.set("blocker.analytics", checked);

											this.showRestartDialog();
										},
									},
									{
										label: "Block Trackers",
										type: "checkbox",
										checked: config.get("blocker.trackers"),
										click: ({ checked }) => {
											config.set("blocker.trackers", checked);

											this.showRestartDialog();
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

											// @TODO
											// setAutoUpdateCheck(checked);
										},
									},
									{
										label: "Notify When Update Downloaded",
										type: "checkbox",
										checked: config.get("updates.notifyWhenDownloaded"),
										click({ checked }: { checked: boolean }) {
											config.set("updates.notifyWhenDownloaded", checked);
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
							this.gmail.sendToRenderer({
								type: "go-to",
								destination: "settings",
							});

							this.main.show();
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
							this.gmail.sendToRenderer({ type: "compose-email" });

							this.main.show();
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
					...config.get("accounts").map((account, index) => ({
						label: account.label,
						click: () => {
							selectAccount(account.id, this.gmail);
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
							selectNextAccount(this.gmail);

							this.main.show();
						},
					},
					{
						label: "Select Next Account (hidden shortcut 1)",
						accelerator: "Cmd+Shift+]",
						visible: is.dev,
						acceleratorWorksWhenHidden: true,
						click: () => {
							selectNextAccount(this.gmail);

							this.main.show();
						},
					},
					{
						label: "Select Next Account (hidden shortcut 1)",
						accelerator: "Cmd+Option+Right",
						visible: is.dev,
						acceleratorWorksWhenHidden: true,
						click: () => {
							selectNextAccount(this.gmail);

							this.main.show();
						},
					},
					{
						label: "Select Previous Account",
						accelerator: "Ctrl+Shift+Tab",
						click: () => {
							selectPreviousAccount(this.gmail);

							this.main.show();
						},
					},
					{
						label: "Select Previous Account (hidden shortcut 1)",
						accelerator: "Cmd+Shift+[",
						visible: is.dev,
						acceleratorWorksWhenHidden: true,
						click: () => {
							selectPreviousAccount(this.gmail);

							this.main.show();
						},
					},
					{
						label: "Select Previous Account (hidden shortcut 2)",
						accelerator: "Cmd+Option+Left",
						visible: is.dev,
						acceleratorWorksWhenHidden: true,
						click: () => {
							selectPreviousAccount(this.gmail);

							this.main.show();
						},
					},
					{
						type: "separator",
					},
					{
						label: "Manage Accounts",
						click: () => {
							this.gmail.hide();

							this.main.show();
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
							this.gmail.reload();

							this.main.show();
						},
					},
					{
						label: "Full Reload",
						accelerator: "CommandOrControl+Shift+R",
						click: () => {
							this.main.load();

							this.main.show();
						},
					},
					{
						label: "Developer Tools",
						accelerator: platform.isMacOS ? "Command+Alt+I" : "Control+Shift+I",
						click: () => {
							this.main.window.webContents.openDevTools({ mode: "detach" });

							this.gmail.getSelectedView().webContents.openDevTools();

							this.main.show();
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

							for (const [_accountId, view] of this.gmail.views) {
								view.webContents.setZoomFactor(zoomFactor);
							}

							config.set("gmail.zoomFactor", zoomFactor);
						},
					},
					{
						label: "Zoom In",
						accelerator: "CommandOrControl+Plus",
						click: () => {
							const zoomFactor = config.get("gmail.zoomFactor") + 0.1;

							for (const [_accountId, view] of this.gmail.views) {
								view.webContents.setZoomFactor(zoomFactor);
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
								for (const [_accountId, view] of this.gmail.views) {
									view.webContents.setZoomFactor(zoomFactor);
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
							this.gmail.sendToRenderer({
								type: "go-to",
								destination: "inbox",
							});

							this.main.show();
						},
					},
					{
						label: "Important",
						click: () => {
							this.gmail.sendToRenderer({
								type: "go-to",
								destination: "important",
							});

							this.main.show();
						},
					},
					{
						label: "Snoozed",
						click: () => {
							this.gmail.sendToRenderer({
								type: "go-to",
								destination: "inbox",
							});

							this.main.show();
						},
					},
					{
						label: "Starred",
						click: () => {
							this.gmail.sendToRenderer({
								type: "go-to",
								destination: "starred",
							});

							this.main.show();
						},
					},
					{
						type: "separator",
					},
					{
						label: "Drafts",
						click: () => {
							this.gmail.sendToRenderer({
								type: "go-to",
								destination: "drafts",
							});

							this.main.show();
						},
					},
					{
						label: "Scheduled",
						click: () => {
							this.gmail.sendToRenderer({
								type: "go-to",
								destination: "scheduled",
							});

							this.main.show();
						},
					},
					{
						label: "Sent",
						click: () => {
							this.gmail.sendToRenderer({
								type: "go-to",
								destination: "sent",
							});

							this.main.show();
						},
					},
					{
						type: "separator",
					},
					{
						label: "All Mail",
						click: () => {
							this.gmail.sendToRenderer({
								type: "go-to",
								destination: "all",
							});

							this.main.show();
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
									config.clear();

									this.showRestartDialog();
								},
							},
							{
								type: "separator",
							},
							{
								label: "Clear Cache",
								click: () => {
									for (const { id } of config.get("accounts")) {
										session.fromPartition(`persist:${id}`).clearCache();
									}

									this.showRestartDialog();
								},
							},
							{
								label: "Reset App Data",
								click: () => {
									for (const { id } of config.get("accounts")) {
										session.fromPartition(`persist:${id}`).clearStorageData();
									}

									config.clear();

									this.showRestartDialog();
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

	async showRestartDialog() {
		const { response } = await dialog.showMessageBox({
			type: "info",
			buttons: ["Restart", "Later"],
			message: "Restart required to apply changes",
			detail: "Do you want to restart the app now?",
			defaultId: 0,
			cancelId: 1,
		});

		if (response === 0) {
			app.relaunch();
			app.quit();
		}
	}
}
