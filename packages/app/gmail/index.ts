import EventEmitter from "node:events";
import fs from "node:fs";
import path from "node:path";
import { blocker } from "@/blocker";
import { config } from "@/config";
import { main } from "@/main";
import { appState } from "@/state";
import { openExternalUrl } from "@/url";
import { is } from "@electron-toolkit/utils";
import {
	APP_TITLEBAR_HEIGHT,
	GOOGLE_ACCOUNTS_URL,
} from "@meru/shared/constants";
import { GMAIL_URL, type GmailState } from "@meru/shared/gmail";
import type { AccountConfig } from "@meru/shared/schemas";
import { BrowserWindow, WebContentsView, app, session } from "electron";
import electronContextMenu from "electron-context-menu";
import gmailCSS from "./gmail.css";
import meruCSS from "./meru.css";

type GmailEvents = {
	"state-changed": (newState: GmailState, previousState: GmailState) => void;
};

const WINDOW_OPEN_URL_WHITELIST = [
	/googleusercontent\.com\/viewer\/secure\/pdf/, // Print PDF
];

const SUPPORTED_GOOGLE_APPS_URL_REGEXP = /(calendar|docs|drive)\.google\.com/;

const WINDOW_OPEN_DOWNLOAD_URL_WHITELIST = [
	/chat\.google\.com\/u\/\d\/api\/get_attachment_url/,
];

const PRELOAD_PATH = path.join(__dirname, "gmail-preload", "index.js");

export class Gmail {
	static userStylesPath = path.join(
		app.getPath("userData"),
		"gmail-user-styles.css",
	);

	private _emitter = new EventEmitter();

	private _view: WebContentsView | undefined;

	private _windows: Set<BrowserWindow> = new Set();

	state: GmailState = {
		title: "",
		navigationHistory: {
			canGoBack: false,
			canGoForward: false,
		},
		unreadCount: 0,
		attentionRequired: false,
	};

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

	private _userStyles: string | undefined;

	private injectUserStyles() {
		if (appState.isValidLicenseKey) {
			if (!this._userStyles && fs.existsSync(Gmail.userStylesPath)) {
				this._userStyles = fs.readFileSync(Gmail.userStylesPath, "utf-8");
			}

			if (this._userStyles) {
				this.view.webContents.insertCSS(this._userStyles);
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
					(isSupportedGoogleApp && appState.isValidLicenseKey)) &&
				disposition !== "background-tab"
			) {
				if (isSupportedGoogleApp && this._windows.size > 0) {
					const urlHostname = new URL(url).hostname;

					for (const window of this._windows) {
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
							width: 1280,
							height: 800,
						});

						this.registerWindowOpenHandler(window);

						this.setupContextMenu(window);

						this._windows.add(window);

						window.once("closed", () => {
							this._windows.delete(window);
						});

						return window.webContents;
					},
				};
			}

			if (WINDOW_OPEN_DOWNLOAD_URL_WHITELIST.some((regex) => regex.test(url))) {
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
			// @ts-expect-error: Works with WebContentsView
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
					case "media": {
						callback(true);
						break;
					}
					case "notifications": {
						callback(false);
						break;
					}
				}
			},
		);

		blocker.setupSession(accountSession);

		this.view = new WebContentsView({
			webPreferences: {
				partition: sessionPartitionKey,
				preload: PRELOAD_PATH,
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

		main.window.contentView.addChildView(this.view);

		this.updateViewBounds();

		const searchParams = new URLSearchParams();

		if (config.get("gmail.hideGmailLogo")) {
			searchParams.set("hideGmailLogo", "true");
		}

		if (config.get("gmail.hideInboxFooter")) {
			searchParams.set("hideInboxFooter", "true");
		}

		if (config.get("gmail.reverseConversation") && appState.isValidLicenseKey) {
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
		this._emitter.on(event, listener);

		return () => {
			this.off(event, listener);
		};
	}

	off<K extends keyof GmailEvents>(event: K, listener: GmailEvents[K]) {
		return this._emitter.off(event, listener);
	}

	emit<K extends keyof GmailEvents>(
		event: K,
		...args: Parameters<GmailEvents[K]>
	) {
		return this._emitter.emit(event, ...args);
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

	reload() {
		this.view.webContents.reload();
	}

	destroy() {
		this.view.webContents.removeAllListeners();

		this.view.webContents.close();

		this.view.removeAllListeners();

		main.window.contentView.removeChildView(this.view);
	}

	mailto(url: string) {
		const window = new BrowserWindow({
			webPreferences: {
				session: this.view.webContents.session,
				preload: PRELOAD_PATH,
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
