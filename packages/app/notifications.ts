import { Notification, type NotificationConstructorOptions } from "electron";
import { config } from "./config";
import { ipc } from "./ipc";
import { licenseKey } from "./license-key";
import { checkWithinNotificationTimes } from "./lib/notifications";
import { main } from "./main";

export { checkWithinNotificationTimes };

export function isWithinNotificationTimes() {
  if (!licenseKey.isValid) {
    return true;
  }

  return checkWithinNotificationTimes(config.get("notifications.times"), new Date());
}

export function createNotification({
  click,
  action,
  useSystemSound,
  ...options
}: NotificationConstructorOptions & {
  click?: () => void;
  action?: (index: number) => void;
  useSystemSound?: boolean;
}) {
  if (!Notification.isSupported()) {
    return;
  }

  const sound = config.get("notifications.sound");
  const playSound = config.get("notifications.playSound");
  const playsSystemSound = useSystemSound || (licenseKey.isValid && sound === "system");

  const notification = new Notification({
    silent: playsSystemSound ? !playSound : true,
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

  if (!useSystemSound && sound !== "system" && playSound) {
    notification.once("show", () => {
      ipc.renderer.send(main.window.webContents, "notifications.playSound", {
        sound: licenseKey.isValid ? sound : "linen",
        volume: config.get("notifications.volume"),
      });
    });
  }

  notification.show();

  return notification;
}
