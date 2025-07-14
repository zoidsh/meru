import { randomUUID } from "node:crypto";
import { is, platform } from "@electron-toolkit/utils";
import type { AccountConfigs } from "@meru/shared/schemas";
import type { DownloadItem, NotificationSound } from "@meru/shared/types";
import { app } from "electron";
import Store from "electron-store";

export type Config = {
	accounts: AccountConfigs;
	"accounts.unreadBadge": boolean;
	launchMinimized: boolean;
	launchAtLogin: boolean;
	hardwareAcceleration: boolean;
	resetConfig: boolean;
	theme: "system" | "light" | "dark";
	licenseKey: string | null;
	"dock.enabled": boolean;
	"dock.unreadBadge": boolean;
	"externalLinks.confirm": boolean;
	"externalLinks.trustedHosts": string[];
	"gmail.zoomFactor": number;
	"downloads.saveAs": boolean;
	"downloads.openFolderWhenDone": boolean;
	"downloads.location": string;
	"downloads.history": DownloadItem[];
	"notifications.enabled": boolean;
	"notifications.showSender": boolean;
	"notifications.showSubject": boolean;
	"notifications.showSummary": boolean;
	"notifications.playSound": boolean;
	"notifications.allowFromGoogleApps": boolean;
	"notifications.sound": "system" | NotificationSound;
	"updates.autoCheck": boolean;
	"updates.showNotifications": boolean;
	"blocker.enabled": boolean;
	"blocker.ads": boolean;
	"blocker.tracking": boolean;
	"tray.enabled": boolean;
	"tray.iconColor": "system" | "light" | "dark";
	"tray.unreadCount": boolean;
	"gmail.hideGmailLogo": boolean;
	"gmail.hideInboxFooter": boolean;
	"gmail.reverseConversation": boolean;
	"screenShare.useSystemPicker": boolean;
	"window.lastState": {
		bounds: {
			width: number;
			height: number;
			x: number | undefined;
			y: number | undefined;
		};
		fullscreen: boolean;
		maximized: boolean;
		displayId: number | null;
	};
	"window.restrictMinimumSize": boolean;
	"trial.expired": boolean;
	"googleApps.openInExternalBrowser": boolean;
};

export const DEFAULT_WINDOW_STATE_BOUNDS = {
	width: 1280,
	height: 800,
	x: undefined,
	y: undefined,
};

export const config = new Store<Config>({
	name: is.dev ? "config.dev" : "config",
	accessPropertiesByDotNotation: false,
	defaults: {
		accounts: [
			{
				id: randomUUID(),
				label: "Default",
				selected: true,
				unreadBadge: true,
				notifications: true,
			},
		],
		"accounts.unreadBadge": true,
		launchMinimized: false,
		launchAtLogin: false,
		hardwareAcceleration: false,
		resetConfig: false,
		theme: "system",
		licenseKey: null,
		"dock.enabled": true,
		"dock.unreadBadge": true,
		"externalLinks.confirm": true,
		"externalLinks.trustedHosts": [],
		"gmail.zoomFactor": 1,
		"downloads.saveAs": false,
		"downloads.openFolderWhenDone": false,
		"downloads.location": app.getPath("downloads"),
		"downloads.history": [],
		"notifications.enabled": true,
		"notifications.showSender": true,
		"notifications.showSubject": true,
		"notifications.showSummary": true,
		"notifications.playSound": true,
		"notifications.allowFromGoogleApps": false,
		"notifications.sound": "bell",
		"updates.autoCheck": true,
		"updates.showNotifications": true,
		"blocker.enabled": true,
		"blocker.ads": true,
		"blocker.tracking": true,
		"tray.enabled": !platform.isMacOS,
		"tray.iconColor": "system",
		"tray.unreadCount": true,
		"gmail.hideGmailLogo": true,
		"gmail.hideInboxFooter": true,
		"gmail.reverseConversation": false,
		"screenShare.useSystemPicker": true,
		"window.lastState": {
			bounds: DEFAULT_WINDOW_STATE_BOUNDS,
			fullscreen: false,
			maximized: false,
			displayId: null,
		},
		"window.restrictMinimumSize": true,
		"trial.expired": false,
		"googleApps.openInExternalBrowser": false,
	},
	migrations: {
		">=3.4.0": (store) => {
			// @ts-expect-error: `showDockIcon` is now 'dock.enabled'
			const showDockIcon = store.get("showDockIcon");

			if (typeof showDockIcon === "boolean") {
				store.set("dock.enabled", showDockIcon);

				// @ts-expect-error
				store.delete("showDockIcon");
			}

			const accounts = store.get("accounts");

			if (Array.isArray(accounts)) {
				let accountsMigrated = false;

				for (const account of accounts) {
					if (typeof account.unreadBadge === "undefined") {
						account.unreadBadge = true;
						accountsMigrated = true;
					}

					if (typeof account.notifications === "undefined") {
						account.notifications = true;
						accountsMigrated = true;
					}
				}

				if (accountsMigrated) {
					store.set("accounts", accounts);
				}
			}
		},
		">=3.5.0": (store) => {
			// @ts-expect-error: `lastWindowState` is now 'window.lastState'
			const lastWindowState = store.get("lastWindowState");

			if (lastWindowState) {
				// @ts-expect-error
				store.set("window.lastState", lastWindowState);

				// @ts-expect-error
				store.delete("lastWindowState");
			}
		},
		">=3.9.3": (store) => {
			const lastWindowState = store.get("window.lastState");

			if (lastWindowState && typeof lastWindowState.displayId === "undefined") {
				lastWindowState.displayId = null;

				store.set("window.lastState", lastWindowState);
			}
		},
	},
});
