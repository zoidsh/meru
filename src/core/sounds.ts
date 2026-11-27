import { z } from "zod/mini";

/** New email's sounds, in the order its menu lists them, the default first. */
export const NEW_EMAIL_SOUNDS = [
  "welcome",
  "sunrise",
  "bloom",
  "duet",
  "aurora",
  "daybreak",
  "halo",
  "letter",
  "tide",
  "knock",
  "dew",
  "bead",
] as const;

/** The sounds of every other notification, the default first. */
export const OTHER_SOUNDS = [
  "nod",
  "sip",
  "breath",
  "drop",
  "pair",
  "glint",
  "hush",
] as const;

/** Each of Meru's own sounds, one file each. */
export const NOTIFICATION_SOUNDS = [
  ...NEW_EMAIL_SOUNDS,
  ...OTHER_SOUNDS,
] as const;

export type NotificationSound =
  | (typeof NEW_EMAIL_SOUNDS)[number]
  | (typeof OTHER_SOUNDS)[number];

export const isNotificationSound = (
  choice: unknown
): choice is NotificationSound =>
  (NOTIFICATION_SOUNDS as readonly unknown[]).includes(choice);

/** New email's sound: one of its own, the system's, or none. */
export const NEW_EMAIL_SOUND_CHOICES = [
  ...NEW_EMAIL_SOUNDS,
  "system",
  "none",
] as const;

/** Every other notification's sound: one of its own, the system's, or none. */
export const OTHER_SOUND_CHOICES = [...OTHER_SOUNDS, "system", "none"] as const;

export type NewEmailSoundChoice = (typeof NEW_EMAIL_SOUND_CHOICES)[number];
export type OtherSoundChoice = (typeof OTHER_SOUND_CHOICES)[number];
export type SoundChoice = NewEmailSoundChoice | OtherSoundChoice;

/**
 * Which sound a notification makes: new mail's, or that of every other
 * notification (a verification code today).
 */
export type SoundRole = "newEmail" | "other";

/** What each role plays unless the person chose otherwise, and while free. */
export const DEFAULT_SOUNDS = {
  newEmail: NEW_EMAIL_SOUNDS[0],
  other: OTHER_SOUNDS[0],
} as const satisfies Record<SoundRole, NotificationSound>;

/**
 * Relative to the output volume. Never 0: a sound that plays at no volume is
 * a sound setting that looks on and is silent, which `none` is for.
 */
export const soundVolumeSchema = z.number().check(z.gte(0.05), z.lte(1));

/**
 * After a sound, none plays for this long, so notifications shown together,
 * one poll's or several profiles' at once, make one sound.
 */
export const SOUND_QUIET_PERIOD = 5000;

export interface SoundDecision {
  /** Whether the notification is shown with no sound of the system's. */
  silent: boolean;
  /** The sound Meru plays with it, if any. */
  play: NotificationSound | undefined;
}

/**
 * What a notification shown at `now` sounds like, given the last time one
 * made a sound. A clock set back before `lastSoundAt` ends the quiet period.
 * Whenever Meru plays its own, the notification is silent, or both would play.
 */
export const decideSound = (
  choice: SoundChoice,
  now: number,
  lastSoundAt: number | undefined
): SoundDecision => {
  const due =
    lastSoundAt === undefined ||
    now < lastSoundAt ||
    now - lastSoundAt >= SOUND_QUIET_PERIOD;

  if (choice === "none") {
    return { silent: true, play: undefined };
  }

  if (choice === "system") {
    return { silent: !due, play: undefined };
  }

  return { silent: true, play: due ? choice : undefined };
};

/** Whether the decision makes a sound, which starts a quiet period. */
export const sounds = ({ silent, play }: SoundDecision) =>
  !silent || play !== undefined;
