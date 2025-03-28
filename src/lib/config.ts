import { randomUUID } from "node:crypto";
import { platform } from "@electron-toolkit/utils";
import { app } from "electron";
import Store from "electron-store";

export type AccountConfig = {
	id: string;
	label: string;
	selected: boolean;
};

export type AccountConfigs = AccountConfig[];

type ConfigLastWindowState = {
	bounds: {
		width: number;
		height: number;
		x: number | undefined;
		y: number | undefined;
	};
	fullscreen: boolean;
	maximized: boolean;
};

export type Config = {
	accounts: AccountConfigs;
	lastWindowState: ConfigLastWindowState;
	hardwareAccelerationEnabled: boolean;
	autoHideMenuBar: boolean;
	launchMinimized: boolean;
	trayIconEnabled: boolean;
	titleBarStyle: "system" | "app";
	"app.confirmExternalLink": boolean;
	"app.launchMinimized": boolean;
	"app.launchAtLogin": boolean;
	"app.hardwareAcceleration": boolean;
	"gmail.zoomFactor": number;
	"downloads.saveAs": boolean;
	"downloads.openFolderWhenDone": boolean;
	"downloads.location": string;
	"notifications.enabled": boolean;
	"notifications.showSender": boolean;
	"notifications.showSubject": boolean;
	"notifications.showSummary": boolean;
	"notifications.playSound": boolean;
	"trayIcon.enabled": boolean;
	"blocker.enabled": boolean;
	"blocker.ads": boolean;
	"blocker.analytics": boolean;
	"blocker.trackers": boolean;
	"updates.autoCheck": boolean;
	"updates.notifyWhenDownloaded": boolean;
};

export const config = new Store<Config>({
	defaults: {
		accounts: [{ id: randomUUID(), label: "Personal", selected: true }],
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
		hardwareAccelerationEnabled: true,
		autoHideMenuBar: false,
		launchMinimized: false,
		trayIconEnabled: !platform.isMacOS,
		titleBarStyle: "app",
		"app.confirmExternalLink": true,
		"app.launchMinimized": false,
		"app.launchAtLogin": false,
		"app.hardwareAcceleration": false,
		"gmail.zoomFactor": 1,
		"downloads.saveAs": false,
		"downloads.openFolderWhenDone": false,
		"downloads.location": app.getPath("downloads"),
		"notifications.enabled": true,
		"notifications.showSender": true,
		"notifications.showSubject": true,
		"notifications.showSummary": true,
		"notifications.playSound": true,
		"trayIcon.enabled": true,
		"blocker.enabled": true,
		"blocker.ads": true,
		"blocker.analytics": true,
		"blocker.trackers": true,
		"updates.autoCheck": true,
		"updates.notifyWhenDownloaded": true,
	},
	accessPropertiesByDotNotation: false,
});
