import { config } from "@/config";
import { is } from "@electron-toolkit/utils";
import log from "electron-log";
import { autoUpdater } from "electron-updater";

class AppUpdater {
	private performUpdateCheck() {
		if (config.get("updates.showNotifications")) {
			autoUpdater.checkForUpdatesAndNotify();
		} else {
			autoUpdater.checkForUpdates();
		}
	}

	init() {
		if (is.dev || !config.get("updates.autoCheck")) {
			return;
		}

		log.transports.file.level = is.dev ? "info" : "error";
		autoUpdater.logger = log;

		this.performUpdateCheck();

		setInterval(() => {
			this.performUpdateCheck();
		}, 1000 * 60 * 60 * 3);
	}

	checkForUpdates() {
		if (is.dev) {
			return;
		}

		this.performUpdateCheck();
	}
}

export const appUpdater = new AppUpdater();
