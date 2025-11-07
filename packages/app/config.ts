import { randomUUID } from "node:crypto";
import { is, platform } from "@electron-toolkit/utils";
import type { Config } from "@meru/shared/types";
import { app } from "electron";
import Store from "electron-store";

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
				gmail: {
					delegatedAccountId: null,
				},
			},
		],
		"accounts.unreadBadge": true,
		launchMinimized: false,
		launchAtLogin: false,
		hardwareAcceleration: false,
		resetConfig: false,
		theme: "system",
		licenseKey: null,
		"app.doNotDisturb": false,
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
		"notifications.volume": 0.9,
		"notifications.downloadCompleted": true,
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
		"gmail.savedSearches": [],
		"screenShare.useSystemPicker": true,
		"window.lastState": {
			bounds: DEFAULT_WINDOW_STATE_BOUNDS,
			fullscreen: false,
			maximized: false,
			displayId: null,
		},
		"window.restrictMinimumSize": true,
		"trial.expired": false,
		"googleApps.openInApp": true,
		"googleApps.openAppsInNewWindow": false,
		"verificationCodes.autoCopy": false,
		"verificationCodes.autoDelete": false,
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
		">=3.11.0": (store) => {
			const accounts = store.get("accounts");

			if (Array.isArray(accounts)) {
				let accountsMigrated = false;

				for (const account of accounts) {
					if (typeof account.gmail === "undefined") {
						account.gmail = {
							delegatedAccountId: null,
						};

						accountsMigrated = true;
					}
				}

				if (accountsMigrated) {
					store.set("accounts", accounts);
				}
			}
		},
		">=3.15.0": (store) => {
			const openGoogleAppsInExternalBrowser = store.get(
				// @ts-expect-error: `googleApps.openInExternalBrowser` is now 'googleApps.openInApp'
				"googleApps.openInExternalBrowser",
			);

			if (typeof openGoogleAppsInExternalBrowser === "boolean") {
				store.set("googleApps.openInApp", !openGoogleAppsInExternalBrowser);
			}
		},
	},
});
