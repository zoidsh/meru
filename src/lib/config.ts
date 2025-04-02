import { randomUUID } from "node:crypto";
import { is, platform } from "@electron-toolkit/utils";
import { app } from "electron";
import Store from "electron-store";

export type AccountConfig = {
	id: string;
	label: string;
	selected: boolean;
};

export type AccountConfigs = AccountConfig[];

export type Config = {
	accounts: AccountConfigs;
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
	trayIconEnabled: boolean;
	showDockIcon: boolean;
	resetConfig: boolean;
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
};

export const config = new Store<Config>({
	name: is.dev ? "config.dev" : "config",
	accessPropertiesByDotNotation: false,
	defaults: {
		accounts: [{ id: randomUUID(), label: "Default", selected: true }],
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
		trayIconEnabled: !platform.isMacOS,
		showDockIcon: true,
		resetConfig: false,
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
	},
});
