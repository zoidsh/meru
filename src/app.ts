import { app } from "electron";
import { createIPCHandler } from "electron-trpc/main";
import { AppMenu } from "./app-menu";
import { appState } from "./app-state";
import { Gmail } from "./gmail";
import { createIpcRouter } from "./ipc";
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

	createIPCHandler({
		router: createIpcRouter({ main, gmail }),
		windows: [main.window],
	});

	new Tray({ main, gmail });
	new AppMenu({ main, gmail });

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
