import { describe, expect, it } from "vitest";

import { localDay, nextLocalDay, trialDaysLeft } from "./trial-days.ts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NEW_YORK = "America/New_York";

describe(trialDaysLeft, () => {
  it("reads 14 for a fresh 14-day trial, whatever the hour it starts", () => {
    // 15:00 in New York, and 23:30, half an hour before midnight.
    for (const start of [
      Date.UTC(2026, 10, 10, 20),
      Date.UTC(2026, 10, 11, 4, 30),
    ]) {
      expect(trialDaysLeft(start + 14 * DAY, start, NEW_YORK)).toBe(14);
    }
  });

  it("is 1 the day before the last day and 0 from the midnight that starts it", () => {
    // Ends 16:00 on 25 November in New York.
    const end = Date.UTC(2026, 10, 25, 21);
    const midnight = Date.UTC(2026, 10, 25, 5);

    expect(trialDaysLeft(end, midnight - 1, NEW_YORK)).toBe(1);
    expect(trialDaysLeft(end, midnight, NEW_YORK)).toBe(0);
    expect(trialDaysLeft(end, end - 1, NEW_YORK)).toBe(0);
  });

  it("gives a trial that ends at midnight the day before as its last", () => {
    const midnight = Date.UTC(2026, 10, 25, 5);

    expect(trialDaysLeft(midnight, midnight - HOUR, NEW_YORK)).toBe(0);
    expect(trialDaysLeft(midnight, midnight - DAY - 1, NEW_YORK)).toBe(1);
  });

  it("counts calendar days across a clock change, not 24-hour spans", () => {
    // New York moves its clocks forward at 02:00 on 8 March 2026. A trial
    // ending 00:30 on 10 March is three calendar days from 23:30 on
    // 7 March, though only 48 hours lie between.
    const end = Date.UTC(2026, 2, 10, 4, 30);
    const now = Date.UTC(2026, 2, 8, 4, 30);

    expect(end - now).toBe(48 * HOUR);
    expect(trialDaysLeft(end, now, NEW_YORK)).toBe(3);
  });

  it("follows the device's calendar, so the same instant reads differently by zone", () => {
    const end = Date.UTC(2026, 10, 20, 12);
    const now = Date.UTC(2026, 10, 18, 11);

    expect(trialDaysLeft(end, now, "UTC")).toBe(2);
    // Already the 19th in Auckland, and the end on the 21st.
    expect(trialDaysLeft(end, now, "Pacific/Auckland")).toBe(2);

    // At 09:00 UTC on the 18th it is still the 17th in Honolulu.
    const earlier = Date.UTC(2026, 10, 18, 9);

    expect(trialDaysLeft(end, earlier, "UTC")).toBe(2);
    expect(trialDaysLeft(end, earlier, "Pacific/Honolulu")).toBe(3);
  });
});

describe(nextLocalDay, () => {
  it("is the coming midnight", () => {
    expect(nextLocalDay(Date.UTC(2026, 10, 25, 15), NEW_YORK)).toBe(
      Date.UTC(2026, 10, 26, 5)
    );
  });

  it("is 23 hours away on the day clocks go forward and 25 on the day they go back", () => {
    expect(nextLocalDay(Date.UTC(2026, 2, 8, 5), NEW_YORK)).toBe(
      Date.UTC(2026, 2, 9, 4)
    );
    expect(nextLocalDay(Date.UTC(2026, 10, 1, 4), NEW_YORK)).toBe(
      Date.UTC(2026, 10, 2, 5)
    );
  });

  it("is the first instant of a new calendar day", () => {
    const next = nextLocalDay(Date.UTC(2026, 10, 25, 15), NEW_YORK);

    expect(localDay(next, NEW_YORK) - localDay(next - 1, NEW_YORK)).toBe(1);
  });
});
