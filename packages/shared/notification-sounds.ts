import type { Config } from "./types";

/**
 * The sounds in `/System/Library/Sounds`, by the names macOS resolves them by.
 * A sound bundled in the app would break after every in-place update, because
 * NotificationCenter caches the bundle's file list until it restarts.
 */
export const MACOS_NOTIFICATION_SOUNDS = [
  "Basso",
  "Blow",
  "Bottle",
  "Frog",
  "Funk",
  "Glass",
  "Hero",
  "Morse",
  "Ping",
  "Pop",
  "Purr",
  "Sosumi",
  "Submarine",
  "Tink",
] as const;

export type MacOSNotificationSound = (typeof MACOS_NOTIFICATION_SOUNDS)[number];

export const DEFAULT_MACOS_NOTIFICATION_SOUND = "Blow" satisfies MacOSNotificationSound;

export function isMacOSNotificationSound(sound: unknown): sound is MacOSNotificationSound {
  return MACOS_NOTIFICATION_SOUNDS.includes(sound as MacOSNotificationSound);
}

/** The sound macOS plays for a stored choice, which may be one of the bundled sounds. */
export function resolveMacOSNotificationSound(
  sound: Config["notifications.sound"],
): MacOSNotificationSound | "system" {
  if (sound === "system" || isMacOSNotificationSound(sound)) {
    return sound;
  }

  return DEFAULT_MACOS_NOTIFICATION_SOUND;
}
