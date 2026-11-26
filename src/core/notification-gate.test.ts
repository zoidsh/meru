import { describe, expect, it } from "vitest";

import type { FeedEntry } from "./feed.ts";
import {
  DO_NOT_DISTURB_DURATIONS,
  decideNotification,
  doNotDisturbEnd,
  importantOnly,
  momentOf,
  quietWindowSchema,
} from "./notification-gate.ts";
import type {
  Moment,
  NotificationGates,
  QuietWindow,
} from "./notification-gate.ts";

const SUNDAY = 0;
const MONDAY = 1;
const FRIDAY = 5;
const SATURDAY = 6;

const at = (day: number, time: string, epoch = 0): Moment => ({
  time: epoch,
  day,
  minute: Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)),
});

const decide = (gates: Partial<NotificationGates>) =>
  decideNotification({
    kind: "newMail",
    notifications: true,
    quietHours: [],
    doNotDisturb: undefined,
    now: at(MONDAY, "12:00"),
    ...gates,
  });

const quietAt = (windows: QuietWindow[], now: Moment) =>
  !decide({ quietHours: windows, now }).show;

describe(decideNotification, () => {
  it("shows a notification when nothing holds it", () => {
    expect(decide({})).toStrictEqual({ show: true });
  });

  it("holds every notification while they are switched off", () => {
    expect(decide({ notifications: false })).toStrictEqual({
      show: false,
      reason: "off",
    });
  });

  it("holds while Do Not Disturb is on until turned off, or until a time to come", () => {
    expect([
      decide({ doNotDisturb: { until: null } }),
      decide({ doNotDisturb: { until: 1001 }, now: at(MONDAY, "12:00", 1000) }),
    ]).toStrictEqual([
      { show: false, reason: "doNotDisturb" },
      { show: false, reason: "doNotDisturb" },
    ]);
  });

  it("shows again from the moment Do Not Disturb ends, whether Meru ran through it or was closed", () => {
    expect([
      decide({ doNotDisturb: { until: 1000 }, now: at(MONDAY, "12:00", 1000) }),
      decide({
        doNotDisturb: { until: 1000 },
        now: at(MONDAY, "12:00", 9_000_000),
      }),
    ]).toStrictEqual([{ show: true }, { show: true }]);
  });

  it("reads Do Not Disturb's end by the epoch, so a clock change of the time of day leaves it as it was", () => {
    const doNotDisturb = { until: 5000 };

    expect([
      decide({ doNotDisturb, now: at(MONDAY, "03:00", 4000) }),
      decide({ doNotDisturb, now: at(MONDAY, "01:00", 4000) }),
    ]).toStrictEqual([
      { show: false, reason: "doNotDisturb" },
      { show: false, reason: "doNotDisturb" },
    ]);
  });

  it("shows a verification code's through every hold at once while codes pass Do Not Disturb", () => {
    expect(
      decide({
        kind: "verificationCode",
        notifications: false,
        codesDuringDoNotDisturb: true,
        doNotDisturb: { until: null },
        quietHours: [{ start: "00:00", end: "00:00" }],
      })
    ).toStrictEqual({ show: true });
  });

  it("holds a verification code's in Do Not Disturb and quiet hours while codes do not pass them, but never for notifications being off", () => {
    const code = {
      kind: "verificationCode",
      codesDuringDoNotDisturb: false,
    } as const;

    expect([
      decide({ ...code, doNotDisturb: { until: null } }),
      decide({ ...code, quietHours: [{ start: "00:00", end: "00:00" }] }),
      decide({ ...code, notifications: false }),
    ]).toStrictEqual([
      { show: false, reason: "doNotDisturb" },
      { show: false, reason: "quietHours" },
      { show: true },
    ]);
  });

  it("holds new mail in Do Not Disturb whatever codes pass", () => {
    expect(
      decide({ codesDuringDoNotDisturb: true, doNotDisturb: { until: null } })
    ).toStrictEqual({ show: false, reason: "doNotDisturb" });
  });

  it("names Do Not Disturb before quiet hours when both hold", () => {
    expect(
      decide({
        doNotDisturb: { until: null },
        quietHours: [{ start: "00:00", end: "00:00" }],
      })
    ).toStrictEqual({ show: false, reason: "doNotDisturb" });
  });

  it("holds in quiet hours from the start, inclusive, to the end, exclusive", () => {
    const windows = [{ start: "09:00", end: "17:00" }];

    expect([
      quietAt(windows, at(MONDAY, "08:59")),
      quietAt(windows, at(MONDAY, "09:00")),
      quietAt(windows, at(MONDAY, "16:59")),
      quietAt(windows, at(MONDAY, "17:00")),
    ]).toStrictEqual([false, true, true, false]);
    expect(
      decide({ quietHours: windows, now: at(MONDAY, "12:00") })
    ).toStrictEqual({ show: false, reason: "quietHours" });
  });

  it("holds through a window crossing midnight, and not in the middle of the day", () => {
    const windows = [{ start: "22:00", end: "07:00" }];

    expect([
      quietAt(windows, at(MONDAY, "23:30")),
      quietAt(windows, at(MONDAY, "02:00")),
      quietAt(windows, at(MONDAY, "07:00")),
      quietAt(windows, at(MONDAY, "12:00")),
    ]).toStrictEqual([true, true, false, false]);
  });

  it("counts the hours after midnight to the day a window starts on", () => {
    const fridayNight = [{ start: "22:00", end: "06:00", days: [FRIDAY] }];

    expect([
      quietAt(fridayNight, at(FRIDAY, "23:00")),
      quietAt(fridayNight, at(SATURDAY, "02:00")),
      quietAt(fridayNight, at(FRIDAY, "02:00")),
      quietAt(fridayNight, at(SATURDAY, "23:00")),
    ]).toStrictEqual([true, true, false, false]);
  });

  it("carries Saturday's night into Sunday morning across the week's end", () => {
    const saturdayNight = [{ start: "23:00", end: "08:00", days: [SATURDAY] }];

    expect([
      quietAt(saturdayNight, at(SUNDAY, "07:59")),
      quietAt(saturdayNight, at(MONDAY, "07:59")),
    ]).toStrictEqual([true, false]);
  });

  it("holds a window on one day only on that day", () => {
    const mondays = [{ start: "09:00", end: "10:00", days: [MONDAY] }];

    expect([
      quietAt(mondays, at(MONDAY, "09:30")),
      quietAt(mondays, at(FRIDAY, "09:30")),
    ]).toStrictEqual([true, false]);
  });

  it("reads no days, or an empty list, as every day", () => {
    expect([
      quietAt([{ start: "09:00", end: "10:00" }], at(SUNDAY, "09:30")),
      quietAt(
        [{ start: "09:00", end: "10:00", days: [] }],
        at(SUNDAY, "09:30")
      ),
    ]).toStrictEqual([true, true]);
  });

  it("holds a whole day from the start when a window starts where it ends", () => {
    const allDay = [{ start: "08:00", end: "08:00", days: [MONDAY] }];

    expect([
      quietAt(allDay, at(MONDAY, "07:59")),
      quietAt(allDay, at(MONDAY, "08:00")),
      quietAt(allDay, at(MONDAY, "23:59")),
      quietAt(allDay, at(2, "07:59")),
      quietAt(allDay, at(2, "08:00")),
    ]).toStrictEqual([false, true, true, true, false]);
  });

  it("holds when any of several windows does", () => {
    const windows = [
      { start: "08:00", end: "09:00" },
      { start: "18:00", end: "19:00", days: [FRIDAY] },
    ];

    expect([
      quietAt(windows, at(MONDAY, "08:30")),
      quietAt(windows, at(MONDAY, "18:30")),
      quietAt(windows, at(FRIDAY, "18:30")),
      quietAt(windows, at(FRIDAY, "12:00")),
    ]).toStrictEqual([true, false, true, false]);
  });

  it("follows the wall clock it is given, so a clock or time zone change moves the window with it", () => {
    const windows = [{ start: "01:00", end: "03:00" }];

    // The same instant, read before and after the clock went back an hour.
    expect([
      quietAt(windows, at(SUNDAY, "03:30", 7000)),
      quietAt(windows, at(SUNDAY, "02:30", 7000)),
    ]).toStrictEqual([false, true]);
  });
});

describe(momentOf, () => {
  it("reads the local weekday and minute of the day, and the epoch", () => {
    const date = new Date(2026, 10, 20, 22, 15);

    expect(momentOf(date)).toStrictEqual({
      time: date.getTime(),
      day: FRIDAY,
      minute: 22 * 60 + 15,
    });
  });
});

const parses = (value: unknown) => quietWindowSchema.safeParse(value).success;

describe("a quiet window as settings hold it", () => {
  it("reads times of day as HH:mm and weekdays from 0 to 6", () => {
    expect([
      parses({ start: "00:00", end: "23:59", days: [0, 6] }),
      parses({ start: "24:00", end: "08:00" }),
      parses({ start: "9:00", end: "17:00" }),
      parses({ start: "09:00", end: "17:00", days: [7] }),
      parses({ start: "09:00", end: "17:00", days: [1.5] }),
    ]).toStrictEqual([true, false, false, false, false]);
  });
});

const entry = (id: string) => ({ id }) as FeedEntry;

describe(importantOnly, () => {
  it("keeps the new messages the Important feed lists too", () => {
    expect(
      importantOnly([entry("1"), entry("2")], new Set(["2", "9"]))
    ).toStrictEqual([entry("2")]);
  });

  it("keeps none when the Important feed is empty", () => {
    expect(importantOnly([entry("1")], new Set())).toStrictEqual([]);
  });

  it("keeps them all when the Important feed failed", () => {
    expect(importantOnly([entry("1"), entry("2")], null)).toStrictEqual([
      entry("1"),
      entry("2"),
    ]);
  });
});

const duration = (id: string) => {
  const found = DO_NOT_DISTURB_DURATIONS.find(
    (candidate) => candidate.id === id
  );

  if (!found) {
    throw new Error(`No duration ${id}`);
  }

  return found;
};

describe(doNotDisturbEnd, () => {
  const now = new Date(2026, 10, 17, 23, 50);

  it("ends a timed one that many minutes on, and never one until turned off", () => {
    expect([
      doNotDisturbEnd(duration("30m"), now),
      doNotDisturbEnd(duration("12h"), now),
      doNotDisturbEnd(duration("untilOff"), now),
    ]).toStrictEqual([
      now.getTime() + 30 * 60_000,
      now.getTime() + 12 * 60 * 60_000,
      null,
    ]);
  });

  it("ends until tomorrow at the next local midnight", () => {
    expect(doNotDisturbEnd(duration("untilTomorrow"), now)).toBe(
      new Date(2026, 10, 18).getTime()
    );
  });
});
