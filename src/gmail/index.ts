import EventEmitter from "node:events";
import path from "node:path";
import { type AccountConfig, config } from "@/lib/config";
import {
	APP_SIDEBAR_WIDTH,
	APP_TITLEBAR_HEIGHT,
	GMAIL_URL,
} from "@/lib/constants";
import { openExternalUrl } from "@/lib/url";
import { main } from "@/main";
import { is } from "@electron-toolkit/utils";
import { WebContentsView, session } from "electron";
import electronContextMenu from "electron-context-menu";
import gmailStyles from "./styles.css" with { type: "text" };

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
		const withSidebarInset = config.get("accounts").length > 1;

		this.view.setBounds({
			x: withSidebarInset ? APP_SIDEBAR_WIDTH : 0,
			y: APP_TITLEBAR_HEIGHT,
			width: withSidebarInset ? width - APP_SIDEBAR_WIDTH : width,
			height: height - APP_TITLEBAR_HEIGHT,
		});
	}

	private createView(accountConfig: AccountConfig) {
		const sessionPartitionKey = this.getSessionPartitionKey(accountConfig);

		session
			.fromPartition(sessionPartitionKey)
			.setPermissionRequestHandler((_webContents, permission, callback) => {
				if (permission === "notifications") {
					callback(false);
				}
			});

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
			openExternalUrl(url);

			return {
				action: "deny",
			};
		});

		main.window.contentView.addChildView(this.view);

		this.updateViewBounds();

		this.view.webContents.loadURL(GMAIL_URL);

		if (is.dev) {
			this.view.webContents.openDevTools();
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
