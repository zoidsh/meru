import path from "node:path";
import { is, platform } from "@electron-toolkit/utils";
import { accountColorsMap } from "@meru/shared/accounts";
import {
	APP_TITLEBAR_HEIGHT,
	GOOGLE_ACCOUNTS_URL,
} from "@meru/shared/constants";
import {
	GMAIL_COMPOSE_URL,
	GMAIL_DELEGATED_ACCOUNT_URL_REGEXP,
	GMAIL_URL,
} from "@meru/shared/gmail";
import {
	BrowserWindow,
	type BrowserWindowConstructorOptions,
	dialog,
	globalShortcut,
	powerSaveBlocker,
	type Session,
	WebContentsView,
	type WebContentsViewConstructorOptions,
} from "electron";
import { createStore } from "zustand/vanilla";
import { accounts } from "./accounts";
import { config } from "./config";
import { setupWindowContextMenu } from "./context-menu";
import { ipc } from "./ipc";
import { licenseKey } from "./license-key";
import { main } from "./main";
import { openExternalUrl } from "./url";

const WINDOW_OPEN_URL_WHITELIST = [
	/googleusercontent\.com\/viewer\/secure\/pdf/, // Print PDF
];

const SUPPORTED_GOOGLE_APPS_URL_REGEXP =
	/(calendar|docs|sheets|slides|drive|meet|contacts|voice|gemini|chat|forms|sites|keep|tasks|groups|myaccount|classroom|notebooklm)\.google\.com/;

const WINDOW_OPEN_DOWNLOAD_URL_WHITELIST = [
	/chat\.google\.com\/u\/\d\/api\/get_attachment_url/,
];

type GoogleAppHooks = {
	beforeLoadUrl?: ((view: WebContentsView) => void)[];
};

export type GoogleAppOptions = {
	accountId: string;
	url: string;
	session: Session;
	webContentsViewOptions?: WebContentsViewConstructorOptions;
	hooks?: GoogleAppHooks;
};

export class GoogleApp {
	accountId: string;

	url: string;

	baseUrl: string;

	session: Session;

	webContentsViewOptions: WebContentsViewConstructorOptions | undefined;

	hooks: GoogleAppHooks = {};

	private _view: WebContentsView | undefined;

	get view() {
		if (!this._view) {
			throw new Error("View has not been created yet");
		}

		return this._view;
	}

	set view(view: WebContentsView) {
		this._view = view;
	}

	viewStore = createStore<{
		navigationHistory: {
			canGoBack: boolean;
			canGoForward: boolean;
		};
		attentionRequired: boolean;
	}>(() => ({
		navigationHistory: {
			canGoBack: false,
			canGoForward: false,
		},
		attentionRequired: false,
	}));

	constructor({
		accountId,
		url,
		session,
		webContentsViewOptions,
		hooks,
	}: GoogleAppOptions) {
		this.accountId = accountId;

		this.url = url;

		this.baseUrl = new URL(url).origin;

		this.session = session;

		this.webContentsViewOptions = webContentsViewOptions;

		if (hooks) {
			this.hooks = hooks;
		}
	}

	createView(options?: WebContentsViewConstructorOptions) {
		this.view = new WebContentsView({
			...this.webContentsViewOptions,
			...options,
			webPreferences: {
				...this.webContentsViewOptions?.webPreferences,
				...options?.webPreferences,
				session: this.session,
			},
		});

		main.window.contentView.addChildView(this.view);

		this.registerNavigationHandler();

		this.registerFoundInPageHandler();

		this.registerWindowOpenHandler(this.view);

		setupWindowContextMenu(this.view);

		this.updateViewBounds();

		main.window.on("resize", () => {
			this.updateViewBounds();
		});

		if (this.hooks.beforeLoadUrl) {
			for (const hook of this.hooks.beforeLoadUrl) {
				hook(this.view);
			}
		}

		if (is.dev) {
			this.view.webContents.openDevTools({ mode: "bottom" });
		}

		return this.view.webContents.loadURL(this.url);
	}

	private registerNavigationHandler() {
		this.view.webContents.on(
			"did-navigate",
			(_event: Electron.Event, url: string) => {
				if (
					/accounts\.google.com\/v3\/signin\/challenge\/pk\/presend/.test(url)
				) {
					dialog.showMessageBox({
						type: "info",
						message: "Passkey sign-in not supported yet",
						detail: "Please use password to sign in.",
					});
				}

				this.viewStore.setState({
					navigationHistory: {
						canGoBack: this.view.webContents.navigationHistory.canGoBack(),
						canGoForward:
							this.view.webContents.navigationHistory.canGoForward(),
					},
					attentionRequired: !url.startsWith(this.baseUrl),
				});
			},
		);

		this.view.webContents.on(
			"did-navigate-in-page",
			(_event: Electron.Event) => {
				this.viewStore.setState({
					navigationHistory: {
						canGoBack: this.view.webContents.navigationHistory.canGoBack(),
						canGoForward:
							this.view.webContents.navigationHistory.canGoForward(),
					},
				});
			},
		);

		this.view.webContents.on("will-redirect", (event, url) => {
			if (url.startsWith("https://www.google.com")) {
				event.preventDefault();

				this.view.webContents.loadURL(
					`${GOOGLE_ACCOUNTS_URL}/ServiceLogin?service=mail`,
				);
			}
		});
	}

	private registerFoundInPageHandler() {
		this.view.webContents.on("found-in-page", (_event, result) => {
			ipc.renderer.send(main.window.webContents, "findInPage.result", {
				activeMatch: result.activeMatchOrdinal,
				totalMatches: result.matches,
			});
		});
	}

	updateViewBounds() {
		const { width, height } =
			main.window[platform.isWindows ? "getContentBounds" : "getBounds"]();

		this.view.setBounds({
			x: 0,
			y: APP_TITLEBAR_HEIGHT,
			width,
			height: height - APP_TITLEBAR_HEIGHT,
		});
	}

	destroy() {
		this.view.webContents.removeAllListeners();

		this.view.webContents.close();

		this.view.removeAllListeners();

		main.window.contentView.removeChildView(this.view);
	}

	registerWindowOpenHandler(window: BrowserWindow | WebContentsView) {
		window.webContents.setWindowOpenHandler(({ url, disposition }) => {
			if (url === "about:blank") {
				return {
					action: "allow",
					createWindow: (options) => {
						let newWindow: BrowserWindow | null = new BrowserWindow({
							...options,
							show: false,
						});

						newWindow.webContents.once("will-navigate", (_event, url) => {
							if (newWindow) {
								if (url.startsWith("https://accounts.google.com")) {
									newWindow.show();

									return;
								}

								openExternalUrl(url);

								newWindow.webContents.close();

								newWindow = null;
							}
						});

						return newWindow.webContents;
					},
				};
			}

			const supportedGoogleAppMatch = url.match(
				SUPPORTED_GOOGLE_APPS_URL_REGEXP,
			);

			if (
				(url.startsWith(GMAIL_URL) ||
					WINDOW_OPEN_URL_WHITELIST.some((regex) => regex.test(url)) ||
					(supportedGoogleAppMatch &&
						config.get("googleApps.openInApp") &&
						licenseKey.isValid)) &&
				disposition !== "background-tab"
			) {
				if (supportedGoogleAppMatch) {
					const account = accounts.getAccount(this.accountId);

					if (
						!config.get("googleApps.openAppsInNewWindow") &&
						account.instance.windows.size > 0
					) {
						const urlHostname = new URL(url).hostname;

						for (const window of account.instance.windows) {
							if (
								new URL(window.webContents.getURL()).hostname === urlHostname
							) {
								window.webContents.loadURL(url);

								window.webContents.focus();

								return {
									action: "deny",
								};
							}
						}
					}
				}

				const gmailDelegatedAccountId = url.match(
					GMAIL_DELEGATED_ACCOUNT_URL_REGEXP,
				)?.[1];

				if (gmailDelegatedAccountId) {
					window.webContents.loadURL(url);

					config.set(
						"accounts",
						config.get("accounts").map((account) => {
							if (account.id === this.accountId) {
								return {
									...account,
									gmail: {
										delegatedAccountId: gmailDelegatedAccountId,
									},
								};
							}

							return account;
						}),
					);

					return {
						action: "deny",
					};
				}

				if (url === `${GMAIL_URL}/`) {
					window.webContents.loadURL(url);

					const account = accounts.getAccount(this.accountId);

					if (account.config.gmail.delegatedAccountId) {
						config.set(
							"accounts",
							config.get("accounts").map((account) => {
								if (account.id === this.accountId) {
									return {
										...account,
										gmail: {
											delegatedAccountId: null,
										},
									};
								}

								return account;
							}),
						);
					}

					return {
						action: "deny",
					};
				}

				const setupNewWindow = (newWindow: BrowserWindow) => {
					this.registerWindowOpenHandler(newWindow);

					setupWindowContextMenu(newWindow);

					const account = accounts.getAccount(this.accountId);

					account.instance.windows.add(newWindow);

					if (config.get("googleApps.showAccountColor")) {
						newWindow.webContents.on("dom-ready", () => {
							if (account.config.color) {
								const { value } = accountColorsMap[account.config.color];

								ipc.renderer.send(
									newWindow.webContents,
									"googleApp.showAccountColor",
									value,
								);
							}
						});
					}

					const googleApp = supportedGoogleAppMatch?.[1];

					let powerSaveBlockerId: number | undefined;

					if (googleApp === "meet") {
						powerSaveBlockerId = powerSaveBlocker.start(
							"prevent-display-sleep",
						);

						globalShortcut.register("CommandOrControl+Shift+1", () => {
							ipc.renderer.send(
								newWindow.webContents,
								"googleMeet.toggleMicrophone",
							);
						});

						globalShortcut.register("CommandOrControl+Shift+2", () => {
							ipc.renderer.send(
								newWindow.webContents,
								"googleMeet.toggleCamera",
							);
						});
					}

					newWindow.once("closed", () => {
						account.instance.windows.delete(newWindow);

						if (googleApp === "meet") {
							globalShortcut.unregister("CommandOrControl+Shift+1");
							globalShortcut.unregister("CommandOrControl+Shift+2");
						}

						if (typeof powerSaveBlockerId === "number") {
							powerSaveBlocker.stop(powerSaveBlockerId);
						}
					});
				};

				const newWindowOptions: BrowserWindowConstructorOptions = {
					autoHideMenuBar: true,
					webPreferences: {
						session: this.session,
						preload: path.join(__dirname, "google-app-preload", "index.js"),
					},
				};

				if (url.startsWith(GMAIL_URL) && url.includes("/popout")) {
					return {
						action: "allow",
						createWindow: (inheritedOptions) => {
							const newWindow = new BrowserWindow({
								...inheritedOptions,
								...newWindowOptions,
								webPreferences: {
									...inheritedOptions.webPreferences,
									...newWindowOptions.webPreferences,
								},
							});

							setupNewWindow(newWindow);

							return newWindow.webContents;
						},
					};
				}

				const isGmailComposeUrl = url === GMAIL_COMPOSE_URL;

				const newGoogleAppWindow = new BrowserWindow({
					...newWindowOptions,
					width: isGmailComposeUrl ? 800 : 1280,
					height: isGmailComposeUrl ? 600 : 800,
				});

				setupNewWindow(newGoogleAppWindow);

				newGoogleAppWindow.loadURL(url);

				return {
					action: "deny",
				};
			}

			if (url.startsWith(`${GOOGLE_ACCOUNTS_URL}/AddSession`)) {
				main.navigate("/settings/accounts");
			} else if (
				WINDOW_OPEN_DOWNLOAD_URL_WHITELIST.some((regex) => regex.test(url))
			) {
				window.webContents.downloadURL(url);
			} else {
				openExternalUrl(url, Boolean(supportedGoogleAppMatch));
			}

			return {
				action: "deny",
			};
		});
	}
}
