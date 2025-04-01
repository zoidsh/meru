import { is } from "@electron-toolkit/utils";
import log from "electron-log";
import { autoUpdater } from "electron-updater";
import { config } from "./lib/config";

class Updater {
	init() {
		if (is.dev || !config.get("updates.autoCheck")) {
			return;
		}

		log.transports.file.level = "info";
		autoUpdater.logger = log;

		autoUpdater.checkForUpdatesAndNotify();

		setInterval(
			() => {
				autoUpdater.checkForUpdatesAndNotify();
			},
			1000 * 60 * 60 * 3,
		);
	}
}

export const updater = new Updater();
