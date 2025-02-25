import { app } from "electron";
import { createIPCHandler } from "electron-trpc/main";
import { is } from "electron-util";
import { Gmail } from "./gmail";
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
	const main = new Main();

	const gmail = new Gmail({ main });

	createIPCHandler({
		router: createIpcRouter({ main, gmail }),
		windows: [main.window],
	});

	let isQuittingApp = false;

	app.on("second-instance", () => {
		main.show();
	});

	app.on("activate", () => {
		main.show();
	});

	app.on("before-quit", () => {
		isQuittingApp = true;

		config.set("lastWindowState", {
			bounds: main.window.getBounds(),
			fullscreen: main.window.isFullScreen(),
			maximized: main.window.isMaximized(),
		});
	});

	main.window.on("close", (event) => {
		// Workaround: Closing the main window when on full screen leaves a black screen
		// https://github.com/electron/electron/issues/20263
		if (is.macos && main.window.isFullScreen()) {
			main.window.once("leave-full-screen", () => {
				main.window.hide();
			});

			main.window.setFullScreen(false);
		}

		if (!isQuittingApp) {
			event.preventDefault();

			main.window.blur();

			main.window.hide();
		}
	});
});
