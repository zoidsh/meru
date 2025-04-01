import { config } from "@/lib/config";
import { main } from "@/main";
import { app } from "electron";
import { accounts } from "./accounts";
import { initDownloads } from "./downloads";
import { initIpc } from "./ipc";
import { appMenu } from "./menu";
import { appState } from "./state";
import { appTray } from "./tray";
import { appUpdater } from "./updater";

if (!app.requestSingleInstanceLock()) {
	app.quit();
}

app.setAppUserModelId("dev.timche.meru");

if (config.get("hardwareAcceleration") === false) {
	app.disableHardwareAcceleration();
}

app.whenReady().then(async () => {
	main.init();

	app.on("before-quit", () => {
		appState.isQuittingApp = true;

		config.set("lastWindowState", {
			bounds: main.window.getBounds(),
			fullscreen: main.window.isFullScreen(),
			maximized: main.window.isMaximized(),
		});
	});

	accounts.init();

	initIpc();

	appMenu.init();

	appTray.init();

	appUpdater.init();

	initDownloads();
});
