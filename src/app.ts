import { app } from "electron";
import { createIPCHandler } from "electron-trpc/main";
import { Gmail } from "./gmail";
import { config } from "./lib/config";
import { createIpcRouter } from "./lib/ipc";
import { Main } from "./main";

if (!app.requestSingleInstanceLock()) {
	app.quit();
}

app.whenReady().then(async () => {
	const main = await new Main().whenReady();

	const gmail = new Gmail({ main });

	createIPCHandler({
		router: createIpcRouter({ main, gmail }),
		windows: [main.window],
	});

	app.on("second-instance", () => {
		main.show();
	});

	app.on("before-quit", () => {
		config.set("lastWindowState", {
			bounds: main.window.getBounds(),
			fullscreen: main.window.isFullScreen(),
			maximized: main.window.isMaximized(),
		});
	});
});
