import fs from "node:fs";
import path from "node:path";
import { accounts } from "@/accounts";
import { config } from "@/config";
import { GoogleApp } from "@/google-app";
import { ipc } from "@/ipc";
import { licenseKey } from "@/license-key";
import { main } from "@/main";
import { appTray } from "@/tray";
import { is, platform } from "@electron-toolkit/utils";
import { GMAIL_URL } from "@meru/shared/gmail";
import { type Session, app } from "electron";
import { subscribeWithSelector } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import gmailCSS from "./gmail.css";
import meruCSS from "./meru.css";

export const GMAIL_USER_STYLES_PATH = path.join(
	app.getPath("userData"),
	"gmail-user-styles.css",
);

const GMAIL_USER_STYLES: string | null = fs.existsSync(GMAIL_USER_STYLES_PATH)
	? fs.readFileSync(GMAIL_USER_STYLES_PATH, "utf-8")
	: null;

export class Gmail extends GoogleApp {
	static PRELOAD_PATH = path.join(__dirname, "gmail-preload", "index.js");

	unreadCountEnabled = true;

	store = createStore(
		subscribeWithSelector<{
			unreadCount: number;
			attentionRequired: boolean;
		}>(() => ({
			unreadCount: 0,
			attentionRequired: false,
		})),
	);

	constructor({
		session,
		unreadCountEnabled,
	}: { session: Session; unreadCountEnabled: boolean }) {
		super(GMAIL_URL, {
			webPreferences: {
				preload: Gmail.PRELOAD_PATH,
				session,
			},
		});

		this.unreadCountEnabled = unreadCountEnabled;

		this.registerUnreadCountListener();

		this.setupCSSInjection();

		this.load();
	}

	setUnreadCount(unreadCount: number) {
		if (!this.unreadCountEnabled) {
			return;
		}

		this.store.setState({ unreadCount });
	}

	registerUnreadCountListener() {
		if (!this.unreadCountEnabled) {
			return;
		}

		const dockUnreadBadge = config.get("dock.unreadBadge");

		this.store.subscribe(
			(state) => state.unreadCount,
			() => {
				const totalUnreadCount = accounts.getTotalUnreadCount();

				if (platform.isMacOS && app.dock && dockUnreadBadge) {
					app.dock.setBadge(
						totalUnreadCount ? totalUnreadCount.toString() : "",
					);
				}

				if (platform.isLinux && dockUnreadBadge) {
					app.badgeCount = totalUnreadCount;
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

	private setupCSSInjection() {
		this.view.webContents.on("dom-ready", () => {
			if (this.view.webContents.getURL().startsWith(GMAIL_URL)) {
				this.view.webContents.insertCSS(gmailCSS);

				if (licenseKey.isValid && GMAIL_USER_STYLES) {
					this.view.webContents.insertCSS(GMAIL_USER_STYLES);
				}
			}

			this.view.webContents.insertCSS(meruCSS);
		});
	}

	private load() {
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
	}
}
