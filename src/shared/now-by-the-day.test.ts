import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { followDays } from "./now-by-the-day.ts";

const fakeWindow = () => {
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), {
    visibilityState: "visible" as DocumentVisibilityState,
  });

  return { window, document };
};

describe(followDays, () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 10, 26, 23, 0) });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tells the time at local midnight", () => {
    const told: number[] = [];
    const stop = followDays(fakeWindow(), (now) => told.push(now));

    vi.advanceTimersByTime(60 * 60 * 1000 - 1);
    expect(told).toStrictEqual([]);
    vi.advanceTimersByTime(1);
    expect(told).toStrictEqual([new Date(2026, 10, 27).getTime()]);
    stop();
  });

  it("tells the time as the window is focused after a sleep the timer did not count", () => {
    const told: number[] = [];
    const target = fakeWindow();
    const stop = followDays(target, (now) => told.push(now));
    // Asleep from 23:00 to 9:00 the next day: the clock moves, no timer fires.
    const woke = new Date(2026, 10, 27, 9, 0);

    vi.setSystemTime(woke);
    target.window.dispatchEvent(new Event("focus"));

    expect(told).toStrictEqual([woke.getTime()]);
    stop();
  });

  it("tells the time as the window is shown, not as it is hidden", () => {
    const told: number[] = [];
    const target = fakeWindow();
    const stop = followDays(target, (now) => told.push(now));

    target.document.visibilityState = "hidden";
    target.document.dispatchEvent(new Event("visibilitychange"));
    expect(told).toStrictEqual([]);

    target.document.visibilityState = "visible";
    target.document.dispatchEvent(new Event("visibilitychange"));
    expect(told).toHaveLength(1);
    stop();
  });

  it("tells nothing once stopped", () => {
    const told: number[] = [];
    const target = fakeWindow();

    followDays(target, (now) => told.push(now))();
    target.window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);

    expect(told).toStrictEqual([]);
  });
});
