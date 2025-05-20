import { Notification } from "electron";
import { config } from "./config";

export function createNotification(
	title: string,
	body: string,
	action?: () => void,
): void {
	if (!Notification.isSupported()) {
		return;
	}

	const notification = new Notification({
		body,
		title,
		silent: config.get("notifications.playSound"),
	});

	if (action) {
		notification.on("click", action);
	}

	notification.show();
}
