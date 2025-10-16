import { is } from "@electron-toolkit/utils";
import log from "electron-log";
import { autoUpdater } from "electron-updater";
import { config } from "@/config";
import { ipc } from "./ipc";
import { main } from "./main";

class AppUpdater {
	private async performUpdateCheck() {
		const updateCheckResult = await autoUpdater.checkForUpdates();

		if (
			updateCheckResult?.isUpdateAvailable &&
			config.get("updates.showNotifications")
		) {
			ipc.renderer.send(
				main.window.webContents,
				"appUpdater.updateAvailable",
				updateCheckResult.updateInfo.version,
			);
		}
	}

	init() {
		if (is.dev || !config.get("updates.autoCheck")) {
			return;
		}

		log.transports.file.level = is.dev ? "info" : "error";
		autoUpdater.logger = log;

		this.performUpdateCheck();

		setInterval(
			() => {
				this.performUpdateCheck();
			},
			1000 * 60 * 60 * 3,
		);
	}

	checkForUpdates() {
		if (is.dev) {
			return;
		}

		this.performUpdateCheck();
	}

	quitAndInstall() {
		autoUpdater.quitAndInstall();
	}
}

export const appUpdater = new AppUpdater();
