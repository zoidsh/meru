import EventEmitter from "node:events";
import fs from "node:fs";
import path from "node:path";
import { accounts } from "@/accounts";
import { blocker } from "@/blocker";
import { config } from "@/config";
import { ipc } from "@/ipc";
import { licenseKey } from "@/license-key";
import { main } from "@/main";
import { appState } from "@/state";
import { openExternalUrl } from "@/url";
import { is } from "@electron-toolkit/utils";
import {
	APP_TITLEBAR_HEIGHT,
	GOOGLE_ACCOUNTS_URL,
	GOOGLE_MEET_URL,
} from "@meru/shared/constants";
import { GMAIL_URL, type GmailState } from "@meru/shared/gmail";
import type { AccountConfig } from "@meru/shared/schemas";
import type { SelectedDesktopSource } from "@meru/shared/types";
import {
	BrowserWindow,
	type IpcMainEvent,
	WebContentsView,
	app,
	dialog,
	nativeTheme,
	session,
} from "electron";
import electronContextMenu from "electron-context-menu";
import { ipcMain } from "electron/main";
import gmailCSS from "./gmail.css";
import meruCSS from "./meru.css";

type GmailEvents = {
	"state-changed": (newState: GmailState, previousState: GmailState) => void;
};

const WINDOW_OPEN_URL_WHITELIST = [
	/googleusercontent\.com\/viewer\/secure\/pdf/, // Print PDF
];

const SUPPORTED_GOOGLE_APPS_URL_REGEXP =
	/(calendar|docs|drive|meet|contacts)\.google\.com/;

const WINDOW_OPEN_DOWNLOAD_URL_WHITELIST = [
	/chat\.google\.com\/u\/\d\/api\/get_attachment_url/,
];

const GMAIL_PRELOAD_PATH = path.join(__dirname, "gmail-preload", "index.js");

export const GMAIL_USER_STYLES_PATH = path.join(
	app.getPath("userData"),
	"gmail-user-styles.css",
);

const GMAIL_USER_STYLES: string | null = fs.existsSync(GMAIL_USER_STYLES_PATH)
	? fs.readFileSync(GMAIL_USER_STYLES_PATH, "utf-8")
	: null;

export class Gmail {
	private emitter = new EventEmitter();

	private windows: Set<BrowserWindow> = new Set();

	state: GmailState = {
		title: "",
		navigationHistory: {
			canGoBack: false,
			canGoForward: false,
		},
		unreadCount: 0,
		attentionRequired: false,
	};

	private _view: WebContentsView | undefined;

	get view() {
		if (!this._view) {
			throw new Error("View is not initialized");
		}

		return this._view;
	}

	set view(view: WebContentsView) {
		this._view = view;
	}

	setState(value: Partial<GmailState>) {
		const previousState = { ...this.state };

		this.state = {
			...previousState,
			...value,
		};

		this.emit("state-changed", this.state, previousState);
	}

	setUnreadCount(unreadCount: number) {
		if (typeof this.state.unreadCount === "number") {
			this.setState({
				unreadCount,
			});
		}
	}

	constructor(accountConfig: AccountConfig) {
		if (!accountConfig.unreadBadge) {
			this.setState({
				unreadCount: null,
			});
		}

		this.createView(accountConfig);
	}

	private getSessionPartitionKey(accountConfig: AccountConfig) {
		return `persist:${accountConfig.id}`;
	}

	private injectUserStyles() {
		if (licenseKey.isValid) {
			if (GMAIL_USER_STYLES) {
				this.view.webContents.insertCSS(GMAIL_USER_STYLES);
			}
		}
	}

	updateViewBounds() {
		const { width, height } = main.window.getContentBounds();

		this.view.setBounds({
			x: 0,
			y: APP_TITLEBAR_HEIGHT,
			width,
			height: height - APP_TITLEBAR_HEIGHT,
		});
	}

	private registerWindowOpenHandler(window: BrowserWindow | WebContentsView) {
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

			const isSupportedGoogleApp = SUPPORTED_GOOGLE_APPS_URL_REGEXP.test(url);

			if (
				(url.startsWith(GMAIL_URL) ||
					WINDOW_OPEN_URL_WHITELIST.some((regex) => regex.test(url)) ||
					(isSupportedGoogleApp && licenseKey.isValid)) &&
				disposition !== "background-tab"
			) {
				if (isSupportedGoogleApp && this.windows.size > 0) {
					const urlHostname = new URL(url).hostname;

					for (const window of this.windows) {
						if (new URL(window.webContents.getURL()).hostname === urlHostname) {
							window.loadURL(url);

							window.focus();

							return {
								action: "deny",
							};
						}
					}
				}

				return {
					action: "allow",
					createWindow: (options) => {
						const window = new BrowserWindow({
							...options,
							autoHideMenuBar: true,
							width: 1280,
							height: 800,
						});

						this.registerWindowOpenHandler(window);

						this.setupContextMenu(window);

						this.windows.add(window);

						window.once("closed", () => {
							this.windows.delete(window);
						});

						return window.webContents;
					},
				};
			}

			if (url.startsWith(`${GOOGLE_ACCOUNTS_URL}/AddSession`)) {
				appState.setIsSettingsOpen(true);

				accounts.hide();

				ipc.renderer.send(
					main.window.webContents,
					"accounts.openAddAccountDialog",
				);
			} else if (
				WINDOW_OPEN_DOWNLOAD_URL_WHITELIST.some((regex) => regex.test(url))
			) {
				this.view.webContents.downloadURL(url);
			} else {
				openExternalUrl(url);
			}

			return {
				action: "deny",
			};
		});
	}

	private setupContextMenu(window: WebContentsView | BrowserWindow) {
		electronContextMenu({
			window,
			showCopyImageAddress: true,
			showSaveImageAs: true,
			showInspectElement: false,
			append: (_defaultActions, parameters) => [
				{
					label: "Inspect Element",
					click: () => {
						window.webContents.inspectElement(parameters.x, parameters.y);
						if (window.webContents.isDevToolsOpened()) {
							window.webContents.devToolsWebContents?.focus();
						}
					},
				},
			],
		});
	}

	private createView(accountConfig: AccountConfig) {
		const sessionPartitionKey = this.getSessionPartitionKey(accountConfig);

		const accountSession = session.fromPartition(sessionPartitionKey);

		accountSession.setPermissionRequestHandler(
			(_webContents, permission, callback) => {
				switch (permission) {
					case "clipboard-sanitized-write":
					case "media": {
						callback(true);
						break;
					}
					case "notifications": {
						callback(config.get("notifications.allowFromGoogleApps"));
						break;
					}
				}
			},
		);

		accountSession.setDisplayMediaRequestHandler(
			async (_request, callback) => {
				const googleMeetWindow = this.windows
					.values()
					.find((window) =>
						window.webContents.getURL().startsWith(GOOGLE_MEET_URL),
					);

				if (!googleMeetWindow) {
					callback({});

					return;
				}

				const desktopSourcesWindow = new BrowserWindow({
					title: "Choose what to share — Meru",
					parent: googleMeetWindow,
					width: 576,
					height: 512,
					resizable: false,
					darkTheme: nativeTheme.shouldUseDarkColors,
					autoHideMenuBar: true,
					webPreferences: {
						preload: path.join(__dirname, "renderer-preload", "index.js"),
					},
				});

				const ipcEvent = "desktopSources.select";

				const ipcListener = (
					_event: IpcMainEvent,
					desktopSource: SelectedDesktopSource,
				) => {
					desktopSourcesWindow.removeListener(windowEvent, windowListener);

					callback({ video: desktopSource });

					desktopSourcesWindow.destroy();
				};

				const windowEvent = "closed";

				const windowListener = () => {
					ipcMain.removeListener(ipcEvent, ipcListener);

					callback({});

					desktopSourcesWindow.destroy();
				};

				ipcMain.once(ipcEvent, ipcListener);

				desktopSourcesWindow.once(windowEvent, windowListener);

				const searchParams = new URLSearchParams();

				searchParams.set(
					"darkMode",
					nativeTheme.shouldUseDarkColors ? "true" : "false",
				);

				if (is.dev) {
					desktopSourcesWindow.webContents.loadURL(
						`http://localhost:3001/?${searchParams}`,
					);

					desktopSourcesWindow.webContents.openDevTools({
						mode: "detach",
					});
				} else {
					desktopSourcesWindow.webContents.loadFile(
						path.join("build-js", "desktop-sources", "index.html"),
						{ search: searchParams.toString() },
					);
				}
			},
			{ useSystemPicker: config.get("screenShare.useSystemPicker") },
		);

		blocker.setupSession(accountSession);

		this.view = new WebContentsView({
			webPreferences: {
				partition: sessionPartitionKey,
				preload: GMAIL_PRELOAD_PATH,
			},
		});

		this.setupContextMenu(this.view);

		this.view.webContents.on("dom-ready", () => {
			if (this.view.webContents.getURL().startsWith(GMAIL_URL)) {
				this.view.webContents.insertCSS(gmailCSS);

				this.injectUserStyles();
			}

			this.view.webContents.insertCSS(meruCSS);
		});

		this.view.webContents.on("page-title-updated", (_event, title) => {
			this.setState({ title });
		});

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

				this.setState({
					navigationHistory: {
						canGoBack: this.view.webContents.navigationHistory.canGoBack(),
						canGoForward:
							this.view.webContents.navigationHistory.canGoForward(),
					},
					attentionRequired: !url.startsWith(GMAIL_URL),
					...(typeof this.state.unreadCount === "number"
						? {
								unreadCount: url.startsWith(GMAIL_URL)
									? this.state.unreadCount
									: 0,
							}
						: {}),
				});
			},
		);

		this.view.webContents.on(
			"did-navigate-in-page",
			(_event: Electron.Event) => {
				this.setState({
					navigationHistory: {
						canGoBack: this.view.webContents.navigationHistory.canGoBack(),
						canGoForward:
							this.view.webContents.navigationHistory.canGoForward(),
					},
				});
			},
		);

		this.registerWindowOpenHandler(this.view);

		this.view.webContents.on("will-redirect", (event, url) => {
			if (url.startsWith("https://www.google.com")) {
				event.preventDefault();

				this.view.webContents.loadURL(
					`${GOOGLE_ACCOUNTS_URL}/ServiceLogin?service=mail`,
				);
			}
		});

		this.view.webContents.on("found-in-page", (_event, result) => {
			ipc.renderer.send(main.window.webContents, "findInPage.result", {
				activeMatch: result.activeMatchOrdinal,
				totalMatches: result.matches,
			});
		});

		main.window.contentView.addChildView(this.view);

		this.updateViewBounds();

		const searchParams = new URLSearchParams();

		if (config.get("gmail.hideGmailLogo")) {
			searchParams.set("hideGmailLogo", "true");
		}

		if (config.get("gmail.hideInboxFooter")) {
			searchParams.set("hideInboxFooter", "true");
		}

		if (config.get("gmail.reverseConversation") && licenseKey.isValid) {
			searchParams.set("reverseConversation", "true");
		}

		this.view.webContents.loadURL(`${GMAIL_URL}/?${searchParams}`);

		if (is.dev) {
			this.view.webContents.openDevTools({ mode: "bottom" });
		}

		main.window.on("resize", () => {
			this.updateViewBounds();
		});
	}

	on<K extends keyof GmailEvents>(event: K, listener: GmailEvents[K]) {
		this.emitter.on(event, listener);

		return () => {
			this.off(event, listener);
		};
	}

	off<K extends keyof GmailEvents>(event: K, listener: GmailEvents[K]) {
		return this.emitter.off(event, listener);
	}

	emit<K extends keyof GmailEvents>(
		event: K,
		...args: Parameters<GmailEvents[K]>
	) {
		return this.emitter.emit(event, ...args);
	}

	go(action: "back" | "forward") {
		switch (action) {
			case "back": {
				this.view.webContents.navigationHistory.goBack();
				break;
			}
			case "forward": {
				this.view.webContents.navigationHistory.goForward();
				break;
			}
		}
	}

	destroy() {
		this.view.webContents.removeAllListeners();

		this.view.webContents.close();

		this.view.removeAllListeners();

		main.window.contentView.removeChildView(this.view);
	}

	mailto(url: string) {
		const window = new BrowserWindow({
			autoHideMenuBar: true,
			webPreferences: {
				session: this.view.webContents.session,
				preload: GMAIL_PRELOAD_PATH,
			},
		});

		this.setupContextMenu(window);

		this.registerWindowOpenHandler(window);

		window.webContents.loadURL(
			`${GMAIL_URL}/?extsrc=mailto&url=${encodeURIComponent(url)}`,
		);

		window.once("ready-to-show", () => {
			window.focus();
		});
	}
}
