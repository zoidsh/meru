import { randomUUID } from "node:crypto";
import { is, platform } from "@electron-toolkit/utils";
import { app } from "electron";
import Store from "electron-store";

export type AccountConfig = {
	id: string;
	label: string;
	selected: boolean;
	unreadBadge: boolean;
};

export type AccountConfigs = AccountConfig[];

export type Config = {
	accounts: AccountConfigs;
	"accounts.unreadBadge": boolean;
	lastWindowState: {
		bounds: {
			width: number;
			height: number;
			x: number | undefined;
			y: number | undefined;
		};
		fullscreen: boolean;
		maximized: boolean;
	};
	launchMinimized: boolean;
	launchAtLogin: boolean;
	hardwareAcceleration: boolean;
	resetConfig: boolean;
	theme: "system" | "light" | "dark";
	"dock.enabled": boolean;
	"dock.unreadBadge": boolean;
	"externalLinks.confirm": boolean;
	"externalLinks.trustedHosts": string[];
	"gmail.zoomFactor": number;
	"downloads.saveAs": boolean;
	"downloads.openFolderWhenDone": boolean;
	"downloads.location": string;
	"notifications.enabled": boolean;
	"notifications.showSender": boolean;
	"notifications.showSubject": boolean;
	"notifications.showSummary": boolean;
	"notifications.playSound": boolean;
	"updates.autoCheck": boolean;
	"blocker.enabled": boolean;
	"blocker.ads": boolean;
	"blocker.tracking": boolean;
	"tray.enabled": boolean;
	"tray.iconColor": "system" | "light" | "dark";
	"tray.unreadCount": boolean;
	licenseKey: string | null;
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
			},
		],
		"accounts.unreadBadge": true,
		lastWindowState: {
			bounds: {
				width: 1280,
				height: 800,
				x: undefined,
				y: undefined,
			},
			fullscreen: false,
			maximized: false,
		},
		launchMinimized: false,
		launchAtLogin: false,
		hardwareAcceleration: false,
		resetConfig: false,
		theme: "system",
		"dock.enabled": true,
		"dock.unreadBadge": true,
		"externalLinks.confirm": true,
		"externalLinks.trustedHosts": [],
		"gmail.zoomFactor": 1,
		"downloads.saveAs": false,
		"downloads.openFolderWhenDone": false,
		"downloads.location": app.getPath("downloads"),
		"notifications.enabled": true,
		"notifications.showSender": true,
		"notifications.showSubject": true,
		"notifications.showSummary": true,
		"notifications.playSound": true,
		"updates.autoCheck": true,
		"blocker.enabled": true,
		"blocker.ads": true,
		"blocker.tracking": true,
		"tray.enabled": !platform.isMacOS,
		"tray.iconColor": "system",
		"tray.unreadCount": true,
		licenseKey: null,
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
			let accountsMigrated = false;

			for (const account of accounts) {
				if (typeof account.unreadBadge === "undefined") {
					account.unreadBadge = true;
					accountsMigrated = true;
				}
			}

			if (accountsMigrated) {
				store.set("accounts", accounts);
			}
		},
	},
});
