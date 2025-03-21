import path from "node:path";
import { getSelectedAccount } from "@/lib/accounts";
import { config } from "@/lib/config";
import type { Account } from "@/lib/config/types";
import {
	APP_SIDEBAR_WIDTH,
	APP_TOOLBAR_HEIGHT,
	GMAIL_URL,
} from "@/lib/constants";
import { openExternalUrl } from "@/lib/url";
import type { Main } from "@/main";
import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/main";
import { WebContentsView } from "electron";
import gmailStyles from "./styles.css" with { type: "text" };

// biome-ignore lint/complexity/noBannedTypes: @TODO
export type IpcMainEvents = {};

export type IpcRendererEvent = {
	navigateTo: [
		destination:
			| "inbox"
			| "starred"
			| "snoozed"
			| "sent"
			| "drafts"
			| "imp"
			| "scheduled"
			| "all"
			| "trash"
			| "spam"
			| "settings"
			| "compose",
	];
};

export type GmailNavigationHistory = {
	canGoBack: boolean;
	canGoForward: boolean;
};

export type GmailNavigationHistoryChangedListener = (
	navigationHistory: GmailNavigationHistory,
) => void;

export type GmailVisibleChangedListener = (visible: boolean) => void;

export class Gmail {
	main: Main;

	views = new Map<string, WebContentsView>();
	visible = true;

	ipc: IpcListener<IpcMainEvents>;
	emitter: IpcEmitter<IpcRendererEvent>;

	private listeners = {
		navigationHistoryChanged: new Set<GmailNavigationHistoryChangedListener>(),
		visibleChanged: new Set<GmailVisibleChangedListener>(),
	};

	constructor({ main }: { main: Main }) {
		this.main = main;

		const accounts = config.get("accounts");

		for (const account of accounts) {
			this.createView(account);
		}

		this.main.window.on("resize", () => {
			const { width, height } = this.main.window.getBounds();

			const accounts = config.get("accounts");

			for (const view of this.views.values()) {
				this.setViewBounds({
					view,
					width,
					height,
					sidebarInset: accounts.length > 1,
				});
			}
		});

		main.window.on("focus", () => {
			const selectedAccount = getSelectedAccount();

			const view = this.getView(selectedAccount);

			view.webContents.focus();
		});

		this.ipc = new IpcListener<IpcMainEvents>();

		this.emitter = new IpcEmitter<IpcRendererEvent>();
	}

	createView(account: Account) {
		const view = new WebContentsView({
			webPreferences: {
				partition: this.getPartition(account),
				preload: path.join(
					...(process.env.NODE_ENV === "production"
						? [__dirname]
						: [process.cwd(), "out"]),
					"gmail",
					"preload",
					"index.js",
				),
			},
		});

		this.main.window.contentView.addChildView(view);

		const accounts = config.get("accounts");

		const { width, height } = this.main.window.getBounds();

		this.setViewBounds({
			view,
			width,
			height,
			sidebarInset: accounts.length > 1,
		});

		view.setVisible(this.visible && account.selected);

		view.webContents.loadURL(GMAIL_URL);

		if (process.env.NODE_ENV !== "production") {
			view.webContents.openDevTools();
		}

		view.webContents.setWindowOpenHandler(({ url }) => {
			openExternalUrl(url);

			return {
				action: "deny",
			};
		});

		view.webContents.on("dom-ready", () => {
			if (view.webContents.getURL().startsWith(GMAIL_URL)) {
				view.webContents.insertCSS(gmailStyles);
			}
		});

		if (account.selected) {
			this.setViewListeners(view);
		}

		this.views.set(account.id, view);
	}

	getPartition(account: Account) {
		return `persist:${account.id}`;
	}

	setViewBounds({
		view,
		width,
		height,
		sidebarInset,
	}: {
		view: WebContentsView;
		width: number;
		height: number;
		sidebarInset: boolean;
	}) {
		view.setBounds({
			x: sidebarInset ? APP_SIDEBAR_WIDTH : 0,
			y: APP_TOOLBAR_HEIGHT,
			width: sidebarInset ? width - APP_SIDEBAR_WIDTH : width,
			height: height - APP_TOOLBAR_HEIGHT,
		});
	}

	setAllViewBounds({
		width,
		height,
		sidebarInset,
	}: { width: number; height: number; sidebarInset: boolean }) {
		for (const view of this.views.values()) {
			this.setViewBounds({
				view,
				width,
				height,
				sidebarInset,
			});

			if (!this.visible) {
				view.setVisible(false);
			}
		}
	}

	onVisibleChanged(listener: GmailVisibleChangedListener) {
		this.listeners.visibleChanged.add(listener);

		return () => {
			this.listeners.visibleChanged.delete(listener);
		};
	}

	notifyVisibleChangedListeners(visible: boolean) {
		for (const listener of this.listeners.visibleChanged) {
			listener(visible);
		}
	}

	onNavigationHistoryChanged(listener: GmailNavigationHistoryChangedListener) {
		this.listeners.navigationHistoryChanged.add(listener);

		return () => {
			this.listeners.navigationHistoryChanged.delete(listener);
		};
	}

	notifyNavigationHistoryChangedListeners(
		navigationHistory: GmailNavigationHistory,
	) {
		for (const listener of this.listeners.navigationHistoryChanged) {
			listener(navigationHistory);
		}
	}

	setViewListeners(view: WebContentsView) {
		view.webContents.on("page-title-updated", (_event, title) => {
			this.main.setTitle(title);
		});

		const didNavigateListener = () => {
			this.notifyNavigationHistoryChangedListeners({
				canGoBack: view.webContents.navigationHistory.canGoBack(),
				canGoForward: view.webContents.navigationHistory.canGoForward(),
			});
		};

		view.webContents.on("did-navigate", didNavigateListener);

		view.webContents.on("did-navigate-in-page", didNavigateListener);
	}

	removeViewListeners(view: WebContentsView) {
		view.removeAllListeners();
	}

	setVisible(visible: boolean) {
		this.visible = visible;

		this.notifyVisibleChangedListeners(visible);
	}

	toggleVisible() {
		if (this.visible) {
			this.hide();
		} else {
			this.show();
		}

		return this.visible;
	}

	hide() {
		for (const view of this.views.values()) {
			view.setVisible(false);
		}

		this.setVisible(false);
	}

	show() {
		const selectedAccount = getSelectedAccount();

		if (selectedAccount) {
			for (const [accountId, view] of this.views) {
				if (accountId === selectedAccount.id) {
					view.setVisible(true);

					this.setVisible(true);
				}
			}
		}
	}

	removeView(accountId: Account["id"]) {
		const view = this.views.get(accountId);

		if (!view) {
			throw new Error("View not found");
		}

		view.webContents.close();
		view.webContents.removeAllListeners();
		this.main.window.contentView.removeChildView(view);
		this.views.delete(accountId);
	}

	selectView(account: Account) {
		for (const [accountId, view] of this.views) {
			view.setVisible(accountId === account.id);
			view.webContents.focus();

			if (accountId === account.id) {
				this.setViewListeners(view);

				this.notifyNavigationHistoryChangedListeners({
					canGoBack: view.webContents.navigationHistory.canGoBack(),
					canGoForward: view.webContents.navigationHistory.canGoForward(),
				});

				this.main.setTitle(view.webContents.getTitle());
			} else {
				this.removeViewListeners(view);
			}
		}
	}

	getView(account: Pick<Account, "id">) {
		const view = this.views.get(account.id);

		if (!view) {
			throw new Error("Could not find view");
		}

		return view;
	}

	getSelectedView() {
		return this.getView(getSelectedAccount());
	}

	getNavigationHistory() {
		const view = this.getSelectedView();

		return {
			canGoBack: view.webContents.navigationHistory.canGoBack(),
			canGoForward: view.webContents.navigationHistory.canGoForward(),
		};
	}

	go(action: "back" | "forward") {
		switch (action) {
			case "back": {
				this.getSelectedView().webContents.navigationHistory.goBack();
				break;
			}
			case "forward": {
				this.getSelectedView().webContents.navigationHistory.goForward();
				break;
			}
		}
	}

	reload() {
		this.getSelectedView().webContents.reload();
	}
}
