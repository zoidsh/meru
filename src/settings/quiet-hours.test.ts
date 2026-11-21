import { describe, expect, it } from "vitest";

import {
  QUIET_TIMES,
  addQuietWindow,
  quietDays,
  quietTimesWith,
  removeQuietWindow,
  setQuietDays,
  setQuietTime,
} from "./quiet-hours.ts";

const weekdays = { start: "23:00", end: "07:00", days: [1, 2, 3, 4, 5] };
const weekend = { start: "00:00", end: "00:00", days: [0, 6] };

describe("the quiet hours list", () => {
  it("appends 22:00 to 07:00 every day", () => {
    expect([addQuietWindow([]), addQuietWindow([weekdays])]).toStrictEqual([
      [{ start: "22:00", end: "07:00" }],
      [weekdays, { start: "22:00", end: "07:00" }],
    ]);
  });

  it("removes the window at its place", () => {
    expect([
      removeQuietWindow([weekdays, weekend], 0),
      removeQuietWindow([weekdays], 0),
    ]).toStrictEqual([[weekend], []]);
  });

  it("sets a window's days in order, every day without days, and keeps the last day", () => {
    const list = [weekdays, weekend];

    expect([
      setQuietDays(list, 1, [6, 0, 5]),
      setQuietDays(list, 1, [1, 2, 3, 4, 5, 6, 0]),
      setQuietDays(list, 1, []),
    ]).toStrictEqual([
      [weekdays, { ...weekend, days: [0, 5, 6] }],
      [weekdays, { start: "00:00", end: "00:00" }],
      list,
    ]);
  });

  it("sets either end of a window", () => {
    expect([
      setQuietTime([weekdays, weekend], 1, "start", "21:30"),
      setQuietTime([weekdays], 0, "end", "08:00"),
    ]).toStrictEqual([
      [weekdays, { ...weekend, start: "21:30" }],
      [{ ...weekdays, end: "08:00" }],
    ]);
  });

  it("reads no days, or none listed, as every day, Monday first", () => {
    expect([
      quietDays({ start: "22:00", end: "07:00" }),
      quietDays({ start: "22:00", end: "07:00", days: [] }),
      quietDays(weekend),
    ]).toStrictEqual([
      [1, 2, 3, 4, 5, 6, 0],
      [1, 2, 3, 4, 5, 6, 0],
      [0, 6],
    ]);
  });

  it("offers every half hour, and a time set off it in its place", () => {
    expect([
      QUIET_TIMES.length,
      QUIET_TIMES.slice(0, 3),
      QUIET_TIMES.at(-1),
      quietTimesWith("22:00"),
      quietTimesWith("22:15").slice(44, 47),
    ]).toStrictEqual([
      48,
      ["00:00", "00:30", "01:00"],
      "23:30",
      QUIET_TIMES,
      ["22:00", "22:15", "22:30"],
    ]);
  });
});
