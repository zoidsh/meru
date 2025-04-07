import { config } from "@/lib/config";
import { main } from "@/main";
import { app } from "electron";
import { accounts } from "./accounts";
import { blocker } from "./blocker";
import { initDownloads } from "./downloads";
import { initIpc } from "./ipc";
import { appMenu } from "./menu";
import { appState } from "./state";
import { initTheme } from "./theme";
import { appTray } from "./tray";
import { appUpdater } from "./updater";

(async () => {
	app.setAppUserModelId("sh.zoid.meru");

	if (!app.requestSingleInstanceLock()) {
		app.quit();

		return;
	}

	if (config.get("hardwareAcceleration") === false) {
		app.disableHardwareAcceleration();
	}

	if (config.get("resetConfig")) {
		config.clear();

		app.relaunch();

		app.quit();

		return;
	}

	appUpdater.init();

	initDownloads();

	await Promise.all([app.whenReady(), blocker.init()]);

	initTheme();

	main.init();

	app.on("second-instance", () => {
		main.show();
	});

	app.on("activate", () => {
		main.show();
	});

	main.window.on("focus", () => {
		if (!appState.isSettingsOpen) {
			accounts.getSelectedAccount().gmail.view.webContents.focus();
		}
	});

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
})();
