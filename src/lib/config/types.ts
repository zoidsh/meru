import { z } from "zod";

export const accountSchema = z.object({
	id: z.string(),
	label: z.string(),
	selected: z.boolean(),
});

export type Account = z.infer<typeof accountSchema>;

export type Accounts = Account[];

type LastWindowState = {
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
	accounts: Accounts;
	lastWindowState: LastWindowState;
	hardwareAccelerationEnabled: boolean;
	autoHideMenuBar: boolean;
	launchMinimized: boolean;
	trayIconEnabled: boolean;
	titleBarStyle: "system" | "app";
	"app.confirmExternalLink": boolean;
	"app.launchMinimized": boolean;
	"app.launchAtLogin": boolean;
	"app.hardwareAcceleration": boolean;
	"app.darkMode": "system" | boolean;
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
