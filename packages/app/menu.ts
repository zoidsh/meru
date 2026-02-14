import path from "node:path";
import { is, platform } from "@electron-toolkit/utils";
import { GITHUB_REPO_URL, WEBSITE_URL } from "@meru/shared/constants";
import {
	app,
	clipboard,
	dialog,
	Menu,
	type MenuItemConstructorOptions,
	nativeImage,
	session,
	shell,
} from "electron";
import log from "electron-log";
import { accounts } from "@/accounts";
import { config } from "@/config";
import { showRestartDialog } from "@/dialogs";
import { ipc } from "@/ipc";
import { main } from "@/main";
import { appUpdater } from "@/updater";
import { openExternalUrl } from "@/url";

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
						label: "Settings...",
						click: () => {
							main.navigate("/settings/accounts");
						},
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
						label: "Copy Message URL",
						accelerator: "CommandOrControl+Shift+C",
						click: async () => {
							const account = accounts.getSelectedAccount();
							const webContents = account.instance.gmail.view.webContents;
							const url = webContents.getURL();
							const hash = new URL(url).hash;

							if (!/^#[^/]+\/[A-Za-z0-9]{15,}$/.test(hash)) {
								return;
							}

							const email = await webContents.executeJavaScript(
								`document.querySelector("meta[name='og-profile-acct']")?.getAttribute("content")`,
							);

							if (!email) {
								dialog.showErrorBox(
									"Copy Message URL",
									"Could not determine account email",
								);
								return;
							}

							const messageId = hash.split("/").pop();
							clipboard.writeText(`meru://message/${email}/${messageId}`);
						},
					},
					{
						role: "paste",
					},
					{
						role: "pasteAndMatchStyle",
						accelerator: "CommandOrControl+Shift+V",
					},
					{
						role: "pasteAndMatchStyle",
						accelerator: "CommandOrControl+Option+Shift+V",
						visible: false,
						acceleratorWorksWhenHidden: platform.isMacOS,
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
						label: "Downloads",
						accelerator: "CommandOrControl+Alt+L",
						click: () => {
							main.navigate("/settings/download-history");
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
						visible: is.dev,
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
							main.navigate("/settings/accounts");
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
