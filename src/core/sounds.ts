import { z } from "zod/mini";

/** Meru's own sounds, carried from v3 as they are. */
export const NOTIFICATION_SOUNDS = [
  "breeze",
  "chime",
  "duet",
  "knock",
  "linen",
] as const;

export type NotificationSound = (typeof NOTIFICATION_SOUNDS)[number];

/** One of Meru's sounds, the system's own, or none. */
export const SOUND_CHOICES = [
  ...NOTIFICATION_SOUNDS,
  "system",
  "none",
] as const;

export type SoundChoice = (typeof SOUND_CHOICES)[number];

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
