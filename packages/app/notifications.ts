import fs from "node:fs";
import { platform } from "@electron-toolkit/utils";
import type { Config, NotificationSound } from "@meru/shared/types";
import { Notification, type NotificationConstructorOptions } from "electron";
import { config } from "./config";
import { ipc } from "./ipc";
import { checkWithinNotificationTimes } from "./lib/notifications";
import { licenseKey } from "./license-key";
import { main } from "./main";

/**
 * macOS resolves a notification's `sound` against the bundle's `Resources`
 * directory by bare name; subdirectories and absolute paths do not resolve,
 * and a name that resolves to nothing plays an unrelated system sound rather
 * than staying silent, so a name it cannot resolve must never be passed.
 */
const macOSNotificationSounds = new Set(
  platform.isMacOS
    ? fs
        .readdirSync(process.resourcesPath)
        .filter((entry) => entry.endsWith(".wav"))
        .map((entry) => entry.slice(0, -".wav".length))
    : [],
);

function attachNotificationListeners(
  notification: Notification,
  { click, action }: { click?: () => void; action?: (index: number) => void },
) {
  if (click) {
    notification.once("click", click);
  }

  if (action) {
    notification.once("action", (_event, index) => {
      action(index);
    });
  }
}

function resolveCustomSound(
  sound: Config["notifications.sound"],
  playSound: boolean,
): NotificationSound | null {
  if (!playSound || sound === "system") {
    return null;
  }

  return licenseKey.isValid ? sound : "linen";
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

  const sound = config.get("notifications.sound");
  const playSound = config.get("notifications.playSound");

  const customSound = resolveCustomSound(sound, playSound);

  const macOSSound = customSound && macOSNotificationSounds.has(customSound) ? customSound : null;

  const playSystemSound = licenseKey.isValid && sound === "system" && playSound;

  const notification = new Notification({
    silent: !playSystemSound && !macOSSound,
    ...(macOSSound ? { sound: macOSSound } : {}),
    ...options,
  });

  attachNotificationListeners(notification, { click, action });

  if (customSound && !macOSSound) {
    notification.once("show", () => {
      ipc.renderer.send(main.window.webContents, "notifications.playSound", {
        sound: customSound,
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
