import { ms } from "@meru/shared/ms";
import {
  DEFAULT_MACOS_NOTIFICATION_SOUND,
  isMacOSNotificationSound,
  type MacOSNotificationSound,
  resolveMacOSNotificationSound,
} from "@meru/shared/notification-sounds";
import { timeToMinutes } from "@meru/shared/time";
import type { Config, NotificationSound, NotificationTime } from "@meru/shared/types";

export function checkWithinNotificationTimes(times: NotificationTime[], now: Date) {
  if (!times.length) {
    return true;
  }

  const current = now.getHours() * 60 + now.getMinutes();

  return times.some(({ start, end, days }) => {
    const startMinutes = timeToMinutes(start);
    const endMinutes = timeToMinutes(end);

    const withinTime =
      endMinutes > startMinutes
        ? current >= startMinutes && current < endMinutes
        : current >= startMinutes || current < endMinutes;

    if (!withinTime) {
      return false;
    }

    if (!days || days.length === 0) {
      return true;
    }

    return days.includes(now.getDay());
  });
}

const NEW_EMAIL_SOUND_QUIET_PERIOD = ms("5s");

export function shouldPlayNewEmailSound(now: number, lastNewEmailNotificationAt?: number) {
  return (
    lastNewEmailNotificationAt === undefined ||
    now - lastNewEmailNotificationAt >= NEW_EMAIL_SOUND_QUIET_PERIOD
  );
}

export type NewEmailSound = {
  silent: boolean;
  /** Played by macOS with the notification; without one, macOS plays the user's alert sound. */
  sound?: MacOSNotificationSound;
  /** Played by the renderer once the notification shows. */
  rendererSound?: NotificationSound;
};

/**
 * Decides which new email notifications get a sound, so that several arriving
 * together don't play over each other.
 *
 * On macOS, every notification posted in the same task as the one that opened
 * the sound carries it too. One inbox check posts its notifications in one
 * synchronous loop, and Notification Center shows only the last of them and
 * plays only that one's sound.
 */
export function createNewEmailSoundGate({
  isMacOS,
  now,
  afterTask,
}: {
  isMacOS: boolean;
  now: () => number;
  afterTask: (callback: () => void) => void;
}) {
  let lastNotificationAt: number | undefined;
  let isBatchOpen = false;

  return function allowsSound() {
    const notificationAt = now();
    const allows = isBatchOpen || shouldPlayNewEmailSound(notificationAt, lastNotificationAt);

    lastNotificationAt = notificationAt;

    if (allows && isMacOS && !isBatchOpen) {
      isBatchOpen = true;

      afterTask(() => {
        isBatchOpen = false;
      });
    }

    return allows;
  };
}

/**
 * `show` fires while Do Not Disturb or a Focus suppresses the notification, so
 * on macOS the sound travels with the notification, which macOS silences along
 * with it, instead of being played on `show`.
 */
export function resolveNewEmailSound({
  isMacOS,
  isLicensed,
  sound,
  playSound,
}: {
  isMacOS: boolean;
  isLicensed: boolean;
  sound: Config["notifications.sound"];
  playSound: boolean;
}): NewEmailSound {
  if (!playSound) {
    return { silent: true };
  }

  if (isMacOS) {
    const macOSSound = isLicensed
      ? resolveMacOSNotificationSound(sound)
      : DEFAULT_MACOS_NOTIFICATION_SOUND;

    return macOSSound === "system" ? { silent: false } : { silent: false, sound: macOSSound };
  }

  if (sound === "system") {
    return { silent: !isLicensed };
  }

  return {
    silent: true,
    rendererSound: isLicensed && !isMacOSNotificationSound(sound) ? sound : "linen",
  };
}
