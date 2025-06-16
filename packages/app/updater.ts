import { config } from "@/config";
import { createNotification } from "@/notifications";
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

		// Set up event handlers for manual notification control
		this.setupEventHandlers();

		// Use checkForUpdates instead of checkForUpdatesAndNotify for manual control
		autoUpdater.checkForUpdates();

		setInterval(
			() => {
				autoUpdater.checkForUpdates();
			},
			1000 * 60 * 60 * 3,
		);
	}

	private setupEventHandlers() {
		const showNotifications = config.get("updates.showNotifications");

		if (!showNotifications) {
			return;
		}

		autoUpdater.on("update-available", () => {
			createNotification({
				title: "Update Available",
				body: "A new version is being downloaded in the background.",
			});
		});

		autoUpdater.on("update-downloaded", () => {
			createNotification({
				title: "Update Ready",
				body: "Update downloaded. It will be installed on restart.",
			});
		});
	}

	checkForUpdates() {
		if (is.dev) {
			return;
		}

		autoUpdater.checkForUpdates();
	}
}

export const appUpdater = new AppUpdater();
