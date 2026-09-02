/**
 * When an alarm is due, worked out the way Chrome works it out. Shared by the
 * facade and the main process: main schedules from it, and the facade warns
 * from it in the extension's own console, which is where Chrome puts the
 * warning and the only place the extension's author would ever see it.
 */

import type { AlarmCreateInfo } from "./bridge-protocol";

const MS_PER_MINUTE = 60_000;

/**
 * Chrome's floor on how often an alarm may fire, 30 seconds since Chrome 120.
 *
 * Chrome applies it to packed extensions and lets an unpacked one fire as
 * often as it likes. Every extension Meru loads is unpacked in the narrow
 * sense that it is a directory — the loader unpacks a signed Web Store package
 * and derives a copy of it (`derive/`) — so "unpacked" here describes how Meru
 * loads an extension rather than where it came from, and the author wrote
 * against the clamped behavior. Clamping is therefore the honest reading.
 */
export const MIN_ALARM_PERIOD_MINUTES = 0.5;

/**
 * `setTimeout` counts its delay into a signed 32-bit integer, and anything past
 * that fires immediately instead — so a long wait is served by re-arming across
 * several of these rather than by one timer.
 */
export const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

export type AlarmSchedule = {
  scheduledTime: number;
  periodInMinutes?: number;
};

/** Chrome ignores what it cannot read as a finite number. */
function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clampMinutes(minutes: number | undefined) {
  if (minutes === undefined) {
    return undefined;
  }

  return Math.max(minutes, MIN_ALARM_PERIOD_MINUTES);
}

/**
 * When the alarm first fires and how often after, or `undefined` for a
 * `create` Chrome refuses — one naming no time at all.
 *
 * `when` is an absolute time and is taken as given, including one already past,
 * which Chrome fires at once. A delay or a period is a length of time and is
 * floored at the minimum. An alarm with a period and no start begins one period
 * out, the way Chrome starts it.
 */
export function createAlarmSchedule(
  alarmInfo: AlarmCreateInfo | undefined,
  now: number,
): AlarmSchedule | undefined {
  const periodInMinutes = clampMinutes(readNumber(alarmInfo?.periodInMinutes));

  const when = readNumber(alarmInfo?.when);

  if (when !== undefined) {
    return { scheduledTime: when, periodInMinutes };
  }

  const delayInMinutes = clampMinutes(readNumber(alarmInfo?.delayInMinutes));

  const startInMinutes = delayInMinutes ?? periodInMinutes;

  if (startInMinutes === undefined) {
    return undefined;
  }

  return { scheduledTime: now + startInMinutes * MS_PER_MINUTE, periodInMinutes };
}

/**
 * When a periodic alarm that has just fired is due again.
 *
 * Counted from the time it was due rather than from now, so an alarm on a
 * minute stays on the minute rather than drifting by however late each delivery
 * ran. A machine that slept through several periods comes back with that count
 * already past: Chrome fires once and carries on from the present rather than
 * firing once per period it missed, so the next time is walked forward to the
 * first one still ahead.
 */
export function getNextScheduledTime(schedule: AlarmSchedule, now: number) {
  const periodMs = (schedule.periodInMinutes ?? 0) * MS_PER_MINUTE;

  if (periodMs <= 0) {
    return undefined;
  }

  const elapsedPeriods = Math.floor((now - schedule.scheduledTime) / periodMs);

  return schedule.scheduledTime + periodMs * Math.max(elapsedPeriods + 1, 1);
}

/**
 * What Chrome would have warned about this `create`, or `undefined` when it
 * would have said nothing. A clamped alarm still gets made — the warning is the
 * whole of what the extension is told, so it has to name the alarm and the
 * period it will actually run at.
 */
export function getAlarmClampWarning(name: string, alarmInfo: AlarmCreateInfo | undefined) {
  const belowMinimum = (["delayInMinutes", "periodInMinutes"] as const).filter((field) => {
    const minutes = readNumber(alarmInfo?.[field]);

    return minutes !== undefined && minutes < MIN_ALARM_PERIOD_MINUTES;
  });

  if (belowMinimum.length === 0) {
    return undefined;
  }

  return `Alarm "${name}" asked for ${belowMinimum.join(" and ")} below the ${MIN_ALARM_PERIOD_MINUTES} minute minimum, and will fire every ${MIN_ALARM_PERIOD_MINUTES} minutes instead.`;
}
