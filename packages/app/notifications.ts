import { Notification, type NotificationConstructorOptions } from "electron";
import { config } from "./config";
import { ipc } from "./ipc";
import { checkWithinNotificationTimes, shouldPlayNewEmailSound } from "./lib/notifications";
import { licenseKey } from "./license-key";
import { main } from "./main";

/*
 * Electron detaches a notification's listeners once its wrapper is garbage
 * collected, while the notification itself stays in Notification Center, so a
 * click on it would only bring Meru to the front.
 */
const shownNotifications = new Set<Notification>();

function attachNotificationListeners(
  notification: Notification,
  { click, action }: { click?: () => void; action?: (index: number) => void },
) {
  shownNotifications.add(notification);

  const release = () => {
    shownNotifications.delete(notification);
  };

  notification.once("close", release);
  notification.once("failed", release);

  notification.once("click", () => {
    release();

    click?.();
  });

  notification.once("action", (_event, index) => {
    release();

    action?.(index);
  });
}

export function isWithinNotificationTimes() {
  if (!licenseKey.isValid) {
    return true;
  }

  return checkWithinNotificationTimes(config.get("notifications.times"), new Date());
}

export function areWorkspaceAppNotificationsAllowed() {
  return licenseKey.isValid && config.get("notifications.allowFromWorkspaceApps");
}

// One inbox check can post several notifications at once, and each starting its
// own copy of the sound plays them over each other.
let lastNewEmailNotificationAt: number | undefined;

export function createNewEmailNotification({
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

  const now = performance.now();
  const sound = config.get("notifications.sound");
  const playSound =
    config.get("notifications.playSound") &&
    shouldPlayNewEmailSound(now, lastNewEmailNotificationAt);

  lastNewEmailNotificationAt = now;

  const notification = new Notification({
    silent: licenseKey.isValid && sound === "system" ? !playSound : true,
    ...options,
  });

  attachNotificationListeners(notification, { click, action });

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

  const notification = new Notification(options);

  attachNotificationListeners(notification, { click, action });

  notification.show();

  return notification;
}
