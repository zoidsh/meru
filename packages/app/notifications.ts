import { Notification, type NotificationConstructorOptions } from "electron";
import { config } from "./config";
import { ipc } from "./ipc";
import { licenseKey } from "./license-key";
import { main } from "./main";

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function isWithinNotificationTimes(): boolean {
  const times = config.get("notifications.times");
  if (!times.length) return true;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  return times.some(({ start, end }) => {
    const s = timeToMinutes(start);
    const e = timeToMinutes(end);
    return e > s ? current >= s && current < e : current >= s || current < e;
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
  if (!Notification.isSupported() || config.get("doNotDisturb.enabled") || !isWithinNotificationTimes()) {
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
