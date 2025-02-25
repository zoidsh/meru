import { app } from "electron";
import { createIPCHandler } from "electron-trpc/main";
import { is } from "electron-util";
import { Gmail } from "./gmail";
import { AppState } from "./lib/app-state";
import { config } from "./lib/config";
import { createIpcRouter } from "./lib/ipc";
import { Main } from "./main";

if (!app.requestSingleInstanceLock()) {
	app.quit();
}

app.setAppUserModelId("dev.timche.meru");

if (config.get("hardwareAccelerationEnabled") === false) {
	app.disableHardwareAcceleration();
}

app.whenReady().then(async () => {
	const appState = new AppState();

	const main = new Main({ appState });

	const gmail = new Gmail({ main });

	createIPCHandler({
		router: createIpcRouter({ main, gmail }),
		windows: [main.window],
	});

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
