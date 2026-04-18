import { Notification, type NotificationConstructorOptions } from "electron";
import { config } from "./config";
import { ipc } from "./ipc";
import { licenseKey } from "./license-key";
import { main } from "./main";

function timeToMinutes(time: string) {
  const colonIndex = time.indexOf(":");
  return Number(time.slice(0, colonIndex)) * 60 + Number(time.slice(colonIndex + 1));
}

export function isWithinNotificationTimes() {
  if (!licenseKey.isValid) {
    return true;
  }

  const times = config.get("notifications.times");

  if (!times.length) {
    return true;
  }

  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();

  return times.some(({ start, end }) => {
    const startMinutes = timeToMinutes(start);
    const endMinutes = timeToMinutes(end);

    return endMinutes > startMinutes
      ? current >= startMinutes && current < endMinutes
      : current >= startMinutes || current < endMinutes;
  });
}

export function createNotification({
  click,
  action,
  ...options
}: NotificationConstructorOptions & {
  click?: () => void;
  action?: (index: number) => void;
}) {
  if (!Notification.isSupported()) {
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

  if (sound !== "system" && playSound) {
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
