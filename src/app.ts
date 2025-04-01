import { config } from "@/lib/config";
import { main } from "@/main";
import { app } from "electron";
import { accounts } from "./accounts";
import { appMenu } from "./app-menu";
import { appState } from "./app-state";
import { initIpc } from "./ipc";
import { tray } from "./tray";
import { updater } from "./updater";

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

	tray.init();

	updater.init();
});
