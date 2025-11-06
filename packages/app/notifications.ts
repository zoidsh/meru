import { Notification, type NotificationConstructorOptions } from "electron";
import { config } from "./config";
import { ipc } from "./ipc";
import { licenseKey } from "./license-key";
import { main } from "./main";

export function createNotification({
	click,
	action,
	...options
}: NotificationConstructorOptions & {
	click?: () => void;
	action?: (index: number) => void;
}) {
	if (
		!config.get("notifications.enabled") ||
		config.get("app.doNotDisturb") ||
		!Notification.isSupported()
	) {
		return;
	}

	const sound = config.get("notifications.sound");
	const playSound = config.get("notifications.playSound");

	const notification = new Notification({
		silent: licenseKey.isValid && sound === "system" ? !playSound : true,
		...options,
	});

	if (click) {
		notification.once("click", click);
	}

	if (action) {
		notification.once("action", (_event, index) => {
			action?.(index);
		});
	}

	notification.show();

	if (sound !== "system" && playSound) {
		ipc.renderer.send(
			main.window.webContents,
			"notifications.playSound",
			licenseKey.isValid ? sound : "bell",
		);
	}

	return notification;
}
