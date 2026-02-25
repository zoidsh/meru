import { is } from "@electron-toolkit/utils";
import log from "electron-log";
import { autoUpdater } from "electron-updater";
import { config } from "@/config";
import { ipc } from "./ipc";
import { main } from "./main";
import { appState } from "./state";

class AppUpdater {
	init() {
		autoUpdater.logger = log;

		if (config.get("updates.showNotifications")) {
			autoUpdater.on("update-downloaded", (updateInfo) => {
				ipc.renderer.send(
					main.window.webContents,
					"appUpdater.updateAvailable",
					`v${updateInfo.version}`,
				);
			});
		}

		if (is.dev || !config.get("updates.autoCheck")) {
			return;
		}

		autoUpdater.checkForUpdates();

		setInterval(
			() => {
				autoUpdater.checkForUpdates();
			},
			1000 * 60 * 60 * 3,
		);
	}

	checkForUpdates() {
		if (is.dev) {
			return;
		}

		autoUpdater.checkForUpdates();
	}

	quitAndInstall() {
		main.saveWindowState();

		appState.isQuittingApp = true;

		autoUpdater.quitAndInstall();
	}
}

export const appUpdater = new AppUpdater();
