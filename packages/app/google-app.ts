import path from "node:path";
import { is, platform } from "@electron-toolkit/utils";
import {
	APP_TITLEBAR_HEIGHT,
	GOOGLE_ACCOUNTS_URL,
} from "@meru/shared/constants";
import {
	GMAIL_DELEGATED_ACCOUNT_URL_REGEXP,
	GMAIL_URL,
} from "@meru/shared/gmail";
import {
	BrowserWindow,
	dialog,
	globalShortcut,
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
	/(calendar|docs|sheets|slides|drive|meet|contacts|voice|gemini|chat|forms|sites|keep|tasks|groups|myaccount)\.google\.com/;

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

	private getGoogleAppPreloadScriptPath(googleApp: string) {
		switch (googleApp) {
			case "meet": {
				return path.join(__dirname, `google-${googleApp}-preload`, "index.js");
			}
		}
	}

	registerWindowOpenHandler(window: BrowserWindow | WebContentsView) {
		window.webContents.setWindowOpenHandler(({ url, disposition }) => {
			if (url === "about:blank") {
				return {
					action: "allow",
					createWindow: (options) => {
						let view: WebContentsView | null = new WebContentsView(options);

						view.webContents.once("will-navigate", (_event, url) => {
							openExternalUrl(url);

							if (view) {
								view.webContents.close();

								view = null;
							}
						});

						return view.webContents;
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

					if (account.instance.windows.size > 0) {
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

				const googleApp = supportedGoogleAppMatch?.[1];

				return {
					action: "allow",
					createWindow: (options) => {
						const window = new BrowserWindow({
							...options,
							autoHideMenuBar: true,
							width: 1280,
							height: 800,
							webPreferences: {
								preload: googleApp
									? this.getGoogleAppPreloadScriptPath(googleApp)
									: undefined,
							},
						});

						this.registerWindowOpenHandler(window);

						setupWindowContextMenu(window);

						const account = accounts.getAccount(this.accountId);

						account.instance.windows.add(window);

						if (googleApp === "meet") {
							globalShortcut.register("CommandOrControl+Shift+1", () => {
								ipc.renderer.send(
									window.webContents,
									"googleMeet.toggleMicrophone",
								);
							});

							globalShortcut.register("CommandOrControl+Shift+2", () => {
								ipc.renderer.send(
									window.webContents,
									"googleMeet.toggleCamera",
								);
							});
						}

						window.once("closed", () => {
							account.instance.windows.delete(window);

							if (googleApp === "meet") {
								globalShortcut.unregister("CommandOrControl+Shift+1");
								globalShortcut.unregister("CommandOrControl+Shift+2");
							}
						});

						return window.webContents;
					},
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
