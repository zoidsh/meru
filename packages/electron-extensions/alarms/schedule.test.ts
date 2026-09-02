import { describe, expect, test } from "bun:test";
import {
  createAlarmSchedule,
  getAlarmClampWarning,
  getNextScheduledTime,
  MIN_ALARM_PERIOD_MINUTES,
} from "./schedule";

const NOW = 1_700_000_000_000;

const MS_PER_MINUTE = 60_000;

describe("createAlarmSchedule", () => {
  test("takes an absolute time as given", () => {
    expect(createAlarmSchedule({ when: NOW + 5 * MS_PER_MINUTE }, NOW)).toEqual({
      scheduledTime: NOW + 5 * MS_PER_MINUTE,
      periodInMinutes: undefined,
    });
  });

  test("keeps an absolute time already past, which Chrome fires at once", () => {
    const schedule = createAlarmSchedule({ when: NOW - MS_PER_MINUTE }, NOW);

    expect(schedule?.scheduledTime).toBe(NOW - MS_PER_MINUTE);
  });

  test("counts a delay from now", () => {
    expect(createAlarmSchedule({ delayInMinutes: 2 }, NOW)?.scheduledTime).toBe(
      NOW + 2 * MS_PER_MINUTE,
    );
  });

  test("starts a period-only alarm one period out", () => {
    expect(createAlarmSchedule({ periodInMinutes: 3 }, NOW)).toEqual({
      scheduledTime: NOW + 3 * MS_PER_MINUTE,
      periodInMinutes: 3,
    });
  });

  test("floors a delay and a period at the minimum", () => {
    expect(createAlarmSchedule({ delayInMinutes: 0.1, periodInMinutes: 0.2 }, NOW)).toEqual({
      scheduledTime: NOW + MIN_ALARM_PERIOD_MINUTES * MS_PER_MINUTE,
      periodInMinutes: MIN_ALARM_PERIOD_MINUTES,
    });
  });

  test("refuses a create that names no time at all", () => {
    expect(createAlarmSchedule({}, NOW)).toBeUndefined();
    expect(createAlarmSchedule(undefined, NOW)).toBeUndefined();
  });

  test("ignores what it cannot read as a number", () => {
    expect(createAlarmSchedule({ delayInMinutes: "5" }, NOW)).toBeUndefined();
    expect(createAlarmSchedule({ when: Number.NaN }, NOW)).toBeUndefined();
  });
});

describe("getNextScheduledTime", () => {
  test("has no next time for a one-shot alarm", () => {
    expect(getNextScheduledTime({ scheduledTime: NOW }, NOW)).toBeUndefined();
  });

  test("counts from when the alarm was due, not from when it ran", () => {
    // A delivery 900 ms late must not push the next one 900 ms out
    expect(getNextScheduledTime({ scheduledTime: NOW, periodInMinutes: 1 }, NOW + 900)).toBe(
      NOW + MS_PER_MINUTE,
    );
  });

  test("fires once and carries on after a machine sleeps through several periods", () => {
    const sleptThrough = NOW + 10.5 * MS_PER_MINUTE;

    expect(getNextScheduledTime({ scheduledTime: NOW, periodInMinutes: 1 }, sleptThrough)).toBe(
      NOW + 11 * MS_PER_MINUTE,
    );
  });
});

describe("getAlarmClampWarning", () => {
  test("says nothing about an alarm at or above the minimum", () => {
    expect(getAlarmClampWarning("lockMonitor", { periodInMinutes: 1 })).toBeUndefined();
    expect(
      getAlarmClampWarning("lockMonitor", { periodInMinutes: MIN_ALARM_PERIOD_MINUTES }),
    ).toBeUndefined();
  });

  test("names the alarm and the period it will really run at", () => {
    const warning = getAlarmClampWarning("poll", { periodInMinutes: 0.1 });

    expect(warning).toContain("poll");
    expect(warning).toContain(String(MIN_ALARM_PERIOD_MINUTES));
  });

  test("names both fields when both are below the minimum", () => {
    const warning = getAlarmClampWarning("poll", { delayInMinutes: 0.1, periodInMinutes: 0.2 });

    expect(warning).toContain("delayInMinutes");
    expect(warning).toContain("periodInMinutes");
  });
});
