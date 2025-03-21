import { app } from "electron";
import { AppMenu } from "./app-menu";
import { appState } from "./app-state";
import { Gmail } from "./gmail";
import { initIpc } from "./ipc";
import { config } from "./lib/config";
import { Main } from "./main";
import { Tray } from "./tray";

if (!app.requestSingleInstanceLock()) {
	app.quit();
}

app.setAppUserModelId("dev.timche.meru");

if (config.get("hardwareAccelerationEnabled") === false) {
	app.disableHardwareAcceleration();
}

app.whenReady().then(async () => {
	const main = new Main();

	const gmail = new Gmail({ main });

	const tray = new Tray({ main, gmail });

	new AppMenu({ main, gmail });

	initIpc({ main, gmail, tray });

	app.on("second-instance", () => {
		main.show();
	});

	app.on("activate", () => {
		main.show();
	});

	app.on("before-quit", () => {
		appState.isQuitting = true;

		config.set("lastWindowState", {
			bounds: main.window.getBounds(),
			fullscreen: main.window.isFullScreen(),
			maximized: main.window.isMaximized(),
		});
	});
});
