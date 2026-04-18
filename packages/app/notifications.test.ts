import { describe, expect, mock, test } from "bun:test";
import type { NotificationTime } from "@meru/shared/types";

mock.module("electron", () => ({ Notification: class {} }));
mock.module("./config", () => ({ config: { get: () => [] } }));
mock.module("./ipc", () => ({ ipc: { renderer: { send: () => {} } } }));
mock.module("./license-key", () => ({ licenseKey: { isValid: false } }));
mock.module("./main", () => ({ main: { window: { webContents: {} } } }));

const { checkWithinNotificationTimes } = await import("./notifications");

const makeTime = (start: string, end: string, days?: number[]): NotificationTime => ({
  id: "test-id",
  start,
  end,
  days,
});

// Jan 1 2024 was a Monday (getDay() = 1), so offset dayOfWeek by 1 to get correct days
const makeDate = (dayOfWeek: number, hours: number, minutes: number) => {
  const date = new Date(2024, 0, dayOfWeek); // 0=Sun(Dec31), 1=Mon(Jan1), ..., 6=Sat(Jan6)
  date.setHours(hours, minutes, 0, 0);
  return date;
};

describe("checkWithinNotificationTimes", () => {
  test("returns true when times list is empty", () => {
    const now = makeDate(1, 10, 0);
    expect(checkWithinNotificationTimes([], now)).toBe(true);
  });

  test("returns true when current time is within a window", () => {
    const times = [makeTime("09:00", "17:00")];
    const now = makeDate(1, 12, 0);
    expect(checkWithinNotificationTimes(times, now)).toBe(true);
  });

  test("returns false when current time is outside all windows", () => {
    const times = [makeTime("09:00", "17:00")];
    const now = makeDate(1, 18, 0);
    expect(checkWithinNotificationTimes(times, now)).toBe(false);
  });

  test("returns false at the exact end time (exclusive)", () => {
    const times = [makeTime("09:00", "17:00")];
    const now = makeDate(1, 17, 0);
    expect(checkWithinNotificationTimes(times, now)).toBe(false);
  });

  test("returns true at the exact start time (inclusive)", () => {
    const times = [makeTime("09:00", "17:00")];
    const now = makeDate(1, 9, 0);
    expect(checkWithinNotificationTimes(times, now)).toBe(true);
  });

  test("overnight window includes time after midnight", () => {
    const times = [makeTime("22:00", "06:00")];
    const nowAfterMidnight = makeDate(1, 2, 0);
    expect(checkWithinNotificationTimes(times, nowAfterMidnight)).toBe(true);
  });

  test("overnight window includes time before midnight", () => {
    const times = [makeTime("22:00", "06:00")];
    const nowBeforeMidnight = makeDate(1, 23, 0);
    expect(checkWithinNotificationTimes(times, nowBeforeMidnight)).toBe(true);
  });

  test("overnight window excludes time in the middle of the day", () => {
    const times = [makeTime("22:00", "06:00")];
    const nowMiddleOfDay = makeDate(1, 12, 0);
    expect(checkWithinNotificationTimes(times, nowMiddleOfDay)).toBe(false);
  });

  test("returns true when no days are set (undefined) regardless of day", () => {
    const times = [makeTime("09:00", "17:00", undefined)];
    const sunday = makeDate(0, 12, 0);
    expect(checkWithinNotificationTimes(times, sunday)).toBe(true);
  });

  test("returns true when days array is empty regardless of day", () => {
    const times = [makeTime("09:00", "17:00", [])];
    const sunday = makeDate(0, 12, 0);
    expect(checkWithinNotificationTimes(times, sunday)).toBe(true);
  });

  test("returns true when current day matches a day-specific window", () => {
    const times = [makeTime("09:00", "17:00", [1, 2, 3, 4, 5])]; // weekdays Mon–Fri
    const monday = makeDate(1, 12, 0); // Jan 1 2024 = Monday
    expect(checkWithinNotificationTimes(times, monday)).toBe(true);
  });

  test("returns false when current day does not match a day-specific window", () => {
    const times = [makeTime("09:00", "17:00", [1, 2, 3, 4, 5])]; // weekdays Mon–Fri
    const saturday = makeDate(6, 12, 0); // Jan 6 2024 = Saturday
    expect(checkWithinNotificationTimes(times, saturday)).toBe(false);
  });

  test("all 7 days set behaves like every day", () => {
    const times = [makeTime("09:00", "17:00", [0, 1, 2, 3, 4, 5, 6])];
    const sunday = makeDate(0, 12, 0);
    expect(checkWithinNotificationTimes(times, sunday)).toBe(true);
  });

  test("day-agnostic and day-specific windows are independent (no precedence)", () => {
    const everyDay = makeTime("09:00", "17:00"); // no days = every day
    const mondayOnly = makeTime("10:00", "12:00", [1]); // Monday only
    const times = [everyDay, mondayOnly];

    // Monday 9:30 — everyDay matches even though mondayOnly does not cover 9:30
    const monday930 = makeDate(1, 9, 30); // Jan 1 2024 = Monday
    expect(checkWithinNotificationTimes(times, monday930)).toBe(true);
  });

  test("returns true if any of multiple windows matches", () => {
    const morningWindow = makeTime("08:00", "10:00");
    const eveningWindow = makeTime("18:00", "20:00");
    const times = [morningWindow, eveningWindow];

    expect(checkWithinNotificationTimes(times, makeDate(1, 9, 0))).toBe(true);
    expect(checkWithinNotificationTimes(times, makeDate(1, 14, 0))).toBe(false);
    expect(checkWithinNotificationTimes(times, makeDate(1, 19, 0))).toBe(true);
  });
});
