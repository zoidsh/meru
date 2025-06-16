import { config } from "@/config";
import { is } from "@electron-toolkit/utils";
import log from "electron-log";
import { autoUpdater } from "electron-updater";

class AppUpdater {
	init() {
		if (is.dev || !config.get("updates.autoCheck")) {
			return;
		}

		log.transports.file.level = is.dev ? "info" : "error";
		autoUpdater.logger = log;

		// Call checkForUpdatesAndNotify if notifications are enabled, otherwise just checkForUpdates
		if (config.get("updates.showNotifications")) {
			autoUpdater.checkForUpdatesAndNotify();
		} else {
			autoUpdater.checkForUpdates();
		}

		setInterval(
			() => {
				if (config.get("updates.showNotifications")) {
					autoUpdater.checkForUpdatesAndNotify();
				} else {
					autoUpdater.checkForUpdates();
				}
			},
			1000 * 60 * 60 * 3,
		);
	}

	checkForUpdates() {
		if (is.dev) {
			return;
		}

		if (config.get("updates.showNotifications")) {
			autoUpdater.checkForUpdatesAndNotify();
		} else {
			autoUpdater.checkForUpdates();
		}
	}
}

export const appUpdater = new AppUpdater();
