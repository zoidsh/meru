import fs from "node:fs";
import path from "node:path";
import { platform } from "@electron-toolkit/utils";
import { createGmailDelegatedAccountUrl, GMAIL_URL } from "@meru/shared/gmail";
import { app, BrowserWindow } from "electron";
import { subscribeWithSelector } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import { accounts } from "@/accounts";
import { config } from "@/config";
import { setupWindowContextMenu } from "@/context-menu";
import { GoogleApp, type GoogleAppOptions } from "@/google-app";
import { ipc } from "@/ipc";
import { licenseKey } from "@/license-key";
import { main } from "@/main";
import { appTray } from "@/tray";
import gmailCSS from "./gmail.css";
import meruCSS from "./meru.css";

export const GMAIL_USER_STYLES_PATH = path.join(
	app.getPath("userData"),
	"gmail-user-styles.css",
);

const GMAIL_USER_STYLES: string | null = fs.existsSync(GMAIL_USER_STYLES_PATH)
	? fs.readFileSync(GMAIL_USER_STYLES_PATH, "utf-8")
	: null;

const GMAIL_PRELOAD_PATH = path.join(__dirname, "gmail-preload", "index.js");

export class Gmail extends GoogleApp {
	unreadCountEnabled = true;

	store = createStore(
		subscribeWithSelector<{
			unreadCount: number;
		}>(() => ({
			unreadCount: 0,
		})),
	);

	constructor({
		accountId,
		session,
		unreadCountEnabled,
		delegatedAccountId,
	}: { unreadCountEnabled: boolean; delegatedAccountId: string | null } & Omit<
		GoogleAppOptions,
		"url"
	>) {
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

		super({
			accountId,
			url: `${
				delegatedAccountId
					? createGmailDelegatedAccountUrl(delegatedAccountId)
					: GMAIL_URL
			}/?${searchParams}`,
			session,
			webContentsViewOptions: {
				webPreferences: {
					preload: GMAIL_PRELOAD_PATH,
				},
			},
			hooks: {
				beforeLoadUrl: [
					(view) => {
						view.webContents.on("dom-ready", () => {
							if (view.webContents.getURL().startsWith(GMAIL_URL)) {
								view.webContents.insertCSS(gmailCSS);

								if (licenseKey.isValid && GMAIL_USER_STYLES) {
									view.webContents.insertCSS(GMAIL_USER_STYLES);
								}
							}

							view.webContents.insertCSS(meruCSS);
						});
					},
				],
			},
		});

		this.unreadCountEnabled = unreadCountEnabled;

		this.subscribeToStore();
	}

	setUnreadCount(unreadCount: number) {
		if (!this.unreadCountEnabled) {
			return;
		}

		this.store.setState({ unreadCount });
	}

	subscribeToStore() {
		this.viewStore.subscribe(() => {
			ipc.renderer.send(
				main.window.webContents,
				"accounts.changed",
				accounts.getAccounts().map((account) => ({
					config: account.config,
					gmail: {
						...account.instance.gmail.store.getState(),
						...account.instance.gmail.viewStore.getState(),
					},
				})),
			);
		});

		if (!this.unreadCountEnabled) {
			return;
		}

		if (config.get("accounts.unreadBadge")) {
			const dockUnreadBadge = config.get("dock.unreadBadge");

			this.store.subscribe(
				(state) => state.unreadCount,
				() => {
					const totalUnreadCount = accounts.getTotalUnreadCount();

					if (dockUnreadBadge) {
						if (platform.isMacOS && app.dock) {
							app.dock.setBadge(
								totalUnreadCount ? totalUnreadCount.toString() : "",
							);
						} else if (platform.isLinux) {
							app.badgeCount = totalUnreadCount;
						} else if (platform.isWindows) {
							if (totalUnreadCount) {
								ipc.renderer.send(
									main.window.webContents,
									"taskbar.setOverlayIcon",
									totalUnreadCount,
								);
							} else {
								main.window.setOverlayIcon(null, "");
							}
						}
					}

					appTray.updateUnreadStatus(totalUnreadCount);

					ipc.renderer.send(
						main.window.webContents,
						"accounts.changed",
						accounts.getAccounts().map((account) => ({
							config: account.config,
							gmail: {
								...account.instance.gmail.store.getState(),
								...account.instance.gmail.viewStore.getState(),
							},
						})),
					);
				},
			);
		}
	}

	createComposeWindow(url: string) {
		const window = new BrowserWindow({
			autoHideMenuBar: true,
			webPreferences: {
				session: this.session,
			},
		});

		setupWindowContextMenu(window);

		this.registerWindowOpenHandler(window);

		window.webContents.loadURL(
			`${GMAIL_URL}/?extsrc=mailto&url=${encodeURIComponent(url)}`,
		);

		window.once("ready-to-show", () => {
			window.focus();
		});
	}

	search(query: string) {
		this.view.webContents.executeJavaScript(
			`window.location.hash = "#search/${query}"`,
		);
	}
}
