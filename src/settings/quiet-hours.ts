import type { QuietWindow } from "#core/notification-gate.ts";

/** Days as the gate counts them, 0 Sunday to 6 Saturday, in the order shown. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;

/** What Add quiet hours appends: the night, every day. */
export const NEW_QUIET_WINDOW: QuietWindow = { start: "22:00", end: "07:00" };

/** The times a window's ends offer, every half hour. */
export const QUIET_TIMES = Array.from({ length: 48 }, (_, index) => {
  const hours = String(Math.floor(index / 2)).padStart(2, "0");

  return `${hours}:${index % 2 === 0 ? "00" : "30"}`;
});

/** The offered times, with `time` among them where it was set off the half hour. */
export const quietTimesWith = (time: string) =>
  QUIET_TIMES.includes(time) ? QUIET_TIMES : [...QUIET_TIMES, time].toSorted();

/** The days a window holds on; none stored means every one. */
export const quietDays = (window: QuietWindow): number[] =>
  window.days === undefined || window.days.length === 0
    ? [...WEEK]
    : window.days;

export const addQuietWindow = (list: readonly QuietWindow[]) => [
  ...list,
  NEW_QUIET_WINDOW,
];

export const removeQuietWindow = (
  list: readonly QuietWindow[],
  index: number
) => list.filter((_, at) => at !== index);

/**
 * The window's days set to `days`. A window keeps at least one day, so none
 * leaves the list as it was; every day is stored without `days`.
 */
export const setQuietDays = (
  list: readonly QuietWindow[],
  index: number,
  days: readonly number[]
): readonly QuietWindow[] => {
  const chosen = WEEK.filter((day) => days.includes(day)).toSorted(
    (first, second) => first - second
  );

  if (chosen.length === 0) {
    return list;
  }

  return list.map((window, at) => {
    if (at !== index) {
      return window;
    }

    const { days: _days, ...times } = window;

    return chosen.length === WEEK.length ? times : { ...times, days: chosen };
  });
};

export const setQuietTime = (
  list: readonly QuietWindow[],
  index: number,
  end: "start" | "end",
  time: string
) =>
  list.map((window, at) =>
    at === index ? { ...window, [end]: time } : window
  );
