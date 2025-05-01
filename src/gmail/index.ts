import EventEmitter from "node:events";
import path from "node:path";
import { blocker } from "@/blocker";
import type { AccountConfig } from "@/lib/config";
import {
	APP_TITLEBAR_HEIGHT,
	GMAIL_URL,
	GOOGLE_ACCOUNTS_URL,
} from "@/lib/constants";
import { openExternalUrl } from "@/lib/url";
import { main } from "@/main";
import { is } from "@electron-toolkit/utils";
import { WebContentsView, session } from "electron";
import electronContextMenu from "electron-context-menu";
import gmailStyles from "./styles.css";

export interface GmailMail {
	messageId: string;
	subject: string;
	summary: string;
	link: string;
	sender: {
		name: string;
		email: string;
	};
}

export type GmailState = {
	title: string;
	navigationHistory: {
		canGoBack: boolean;
		canGoForward: boolean;
	};
	unreadCount: number;
	attentionRequired: boolean;
};

type GmailEvents = {
	"state-changed": (newState: GmailState, previousState: GmailState) => void;
};

const WINDOW_OPEN_URL_WHITELIST = [
	/googleusercontent\.com\/viewer\/secure\/pdf/, // Print PDF
];

const WINDOW_OPEN_DOWNLOAD_URL_WHITELIST = [
	/chat\.google\.com\/u\/\d\/api\/get_attachment_url/,
];

export class Gmail {
	private _emitter = new EventEmitter();

	private _view: WebContentsView | undefined;

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

	constructor(accountConfig: AccountConfig) {
		this.createView(accountConfig);
	}

	private getSessionPartitionKey(accountConfig: AccountConfig) {
		return `persist:${accountConfig.id}`;
	}

	updateViewBounds() {
		const { width, height } = main.window.getBounds();

		this.view.setBounds({
			x: 0,
			y: APP_TITLEBAR_HEIGHT,
			width,
			height: height - APP_TITLEBAR_HEIGHT,
		});
	}

	private createView(accountConfig: AccountConfig) {
		const sessionPartitionKey = this.getSessionPartitionKey(accountConfig);

		const accountSession = session.fromPartition(sessionPartitionKey);

		accountSession.setPermissionRequestHandler(
			(_webContents, permission, callback) => {
				if (permission === "notifications") {
					callback(false);
				}
			},
		);

		blocker.setupSession(accountSession);

		this.view = new WebContentsView({
			webPreferences: {
				partition: sessionPartitionKey,
				preload: path.join(
					...(process.env.NODE_ENV === "production"
						? [__dirname]
						: [process.cwd(), "build-js"]),
					"gmail",
					"preload",
					"index.js",
				),
			},
		});

		this.view.webContents.on("did-finish-load", () => {
			electronContextMenu({
				// @ts-expect-error: Works with WebContentsView
				window: this.view,
				showCopyImageAddress: true,
				showSaveImageAs: true,
				showInspectElement: false,
				append: (_defaultActions, parameters) => [
					{
						label: "Inspect Element",
						click: () => {
							this.view.webContents.inspectElement(parameters.x, parameters.y);
							if (this.view.webContents.isDevToolsOpened()) {
								this.view.webContents.devToolsWebContents?.focus();
							}
						},
					},
				],
			});
		});

		this.view.webContents.on("dom-ready", () => {
			if (this.view.webContents.getURL().startsWith(GMAIL_URL)) {
				this.view.webContents.insertCSS(gmailStyles);
			}
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
					unreadCount: url.startsWith(GMAIL_URL) ? this.state.unreadCount : 0,
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

		this.view.webContents.setWindowOpenHandler(({ url }) => {
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

			if (
				url.startsWith(GMAIL_URL) ||
				WINDOW_OPEN_URL_WHITELIST.some((regex) => regex.test(url))
			) {
				return {
					action: "allow",
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

		this.view.webContents.loadURL(GMAIL_URL);

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
}
