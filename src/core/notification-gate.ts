import { z } from "zod/mini";

import type { FeedEntry } from "./feed.ts";
import type { DoNotDisturb } from "./state.ts";

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

/**
 * A window in which notifications are held: from `start` on each of `days`
 * (0 Sunday to 6 Saturday, none meaning every day) until `end`, the next day
 * when `end` is not after `start`, so equal times hold a whole day.
 */
export const quietWindowSchema = z.object({
  start: z.string().check(z.regex(TIME)),
  end: z.string().check(z.regex(TIME)),
  days: z.optional(z.array(z.int().check(z.gte(0), z.lte(6)))),
});

export type QuietWindow = z.infer<typeof quietWindowSchema>;

/** The moment a decision is made: the epoch for ends, the wall clock for windows. */
export interface Moment {
  /** Milliseconds since the epoch. */
  time: number;
  /** The local weekday, 0 Sunday to 6 Saturday. */
  day: number;
  /** Minutes since local midnight. */
  minute: number;
}

/** The moment `date` is, by the local clock it is read with. */
export const momentOf = (date: Date): Moment => ({
  time: date.getTime(),
  day: date.getDay(),
  minute: date.getHours() * 60 + date.getMinutes(),
});

const minutesOf = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

const startsOn = (window: QuietWindow, day: number) =>
  !window.days?.length || window.days.includes(day);

/** Whether the window holds now, the part past midnight counted to its start day. */
const holds = (window: QuietWindow, { day, minute }: Moment) => {
  const start = minutesOf(window.start);
  const end = minutesOf(window.end);

  if (end > start) {
    return startsOn(window, day) && minute >= start && minute < end;
  }

  return (
    (startsOn(window, day) && minute >= start) ||
    (startsOn(window, (day + 6) % 7) && minute < end)
  );
};

/** Whether Do Not Disturb holds at `time`: on, and either untimed or not yet ended. */
export const isDoNotDisturbOn = (
  doNotDisturb: DoNotDisturb | undefined,
  time: number
) =>
  doNotDisturb !== undefined &&
  (doNotDisturb.until === null || doNotDisturb.until > time);

/** Every kind a notification may be; each later kind joins here. */
export type NotificationKind = "newMail" | "verificationCode";

export type HoldReason = "off" | "doNotDisturb" | "quietHours";

export type NotificationDecision =
  | { show: true }
  | { show: false; reason: HoldReason };

export interface NotificationGates {
  kind: NotificationKind;
  /** The switch for every new-mail notification. */
  notifications: boolean;
  quietHours: readonly QuietWindow[];
  doNotDisturb: DoNotDisturb | undefined;
  now: Moment;
}

/**
 * Whether a notification is shown or held, and why. A held one is not shown
 * later: what it was for still counts as seen and unread.
 */
export const decideNotification = ({
  kind,
  notifications,
  quietHours,
  doNotDisturb,
  now,
}: NotificationGates): NotificationDecision => {
  // A code arrives while the person is signing in, and in the click-to-copy
  // mode the notification is the only way to it, so nothing holds one.
  if (kind === "verificationCode") {
    return { show: true };
  }

  if (!notifications) {
    return { show: false, reason: "off" };
  }

  if (isDoNotDisturbOn(doNotDisturb, now.time)) {
    return { show: false, reason: "doNotDisturb" };
  }

  if (quietHours.some((window) => holds(window, now))) {
    return { show: false, reason: "quietHours" };
  }

  return { show: true };
};

/** The label of Gmail's Important feed, as a path segment after the feed's. */
export const IMPORTANT_LABEL = "^iim";

/**
 * The new messages the Important feed also lists. A feed that failed, `null`,
 * keeps them all, since a lost notification costs more than an extra one.
 */
export const importantOnly = (
  fresh: readonly FeedEntry[],
  important: ReadonlySet<string> | null
): FeedEntry[] =>
  important === null
    ? [...fresh]
    : fresh.filter((entry) => important.has(entry.id));

/** How long Do Not Disturb may be switched on for, in its menus' order. */
export const DO_NOT_DISTURB_DURATIONS = [
  { id: "untilOff" },
  { id: "5m", minutes: 5 },
  { id: "10m", minutes: 10 },
  { id: "15m", minutes: 15 },
  { id: "30m", minutes: 30 },
  { id: "1h", minutes: 60 },
  { id: "2h", minutes: 120 },
  { id: "4h", minutes: 240 },
  { id: "8h", minutes: 480 },
  { id: "12h", minutes: 720 },
  { id: "untilTomorrow" },
] as const;

export type DoNotDisturbDuration = (typeof DO_NOT_DISTURB_DURATIONS)[number];

export type DoNotDisturbDurationId = DoNotDisturbDuration["id"];

/**
 * When Do Not Disturb switched on at `now` for `duration` ends: `null` for
 * until turned off, and the next local midnight for until tomorrow.
 */
export const doNotDisturbEnd = (
  duration: DoNotDisturbDuration,
  now: Date
): number | null => {
  if (duration.id === "untilOff") {
    return null;
  }

  if (duration.id === "untilTomorrow") {
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    ).getTime();
  }

  return now.getTime() + duration.minutes * 60_000;
};
