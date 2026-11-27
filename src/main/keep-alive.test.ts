import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KEEP_ALIVE_TIMING, ROTATION_LIFETIME } from "#core/keep-alive.ts";
import { silentLog } from "#core/log.fake.ts";
import type { KeepAlivePages } from "#platform/keep-alive.ts";

import { createKeepAlive } from "./keep-alive.ts";

const START = Date.UTC(2026, 10, 18, 12);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const URL = "https://rotate.test/";
const COOKIE = "rotating";

/** A cookie jar per partition and the pages opened in it, by hand. */
const createFakePages = (expiries: Record<string, number>) => {
  const listeners = new Map<
    string,
    Set<(expiresAt: number | undefined) => void>
  >();
  const opened: { partition: string; url: string; closed: boolean }[] = [];
  const pages: KeepAlivePages = {
    readExpiries: (partition, name) =>
      Promise.resolve(
        name === COOKIE && expiries[partition] !== undefined
          ? [expiries[partition]]
          : []
      ),
    watchCookie: (partition, name, listener) => {
      const set = listeners.get(partition) ?? new Set();

      if (name === COOKIE) {
        set.add(listener);
        listeners.set(partition, set);
      }

      return () => {
        set.delete(listener);
      };
    },
    open: (partition, url) => {
      const page = { partition, url, closed: false };

      opened.push(page);

      return {
        close: () => {
          page.closed = true;
        },
      };
    },
  };

  return {
    pages,
    opened,
    /** The session sets the cookie anew, as a rotation does. */
    rotate: (partition: string) => {
      for (const listener of listeners.get(partition) ?? []) {
        listener(Date.now() + ROTATION_LIFETIME);
      }
    },
    /** The session removes the cookie, as signing out does. */
    remove: (partition: string) => {
      for (const listener of listeners.get(partition) ?? []) {
        listener(undefined);
      }
    },
    watching: (partition: string) => listeners.get(partition)?.size ?? 0,
  };
};

/** A cookie last rotated `ago` before now. */
const rotatedAgo = (ago: number) => START - ago + ROTATION_LIFETIME;

const setup = ({
  expiries = { "persist:a": rotatedAgo(3 * DAY) },
  ids = ["a"],
}: { expiries?: Record<string, number>; ids?: string[] } = {}) => {
  const fake = createFakePages(expiries);
  const world = {
    ids,
    withViews: new Set<string>(),
    signedOut: new Set<string>(),
    online: true,
  };
  const prepared: string[] = [];
  const keepAlive = createKeepAlive({
    pages: fake.pages,
    profileIds: () => world.ids,
    hasView: (id) => world.withViews.has(id),
    signedOut: (id) => world.signedOut.has(id),
    isOnline: () => world.online,
    prepareSession: (partition) => {
      prepared.push(partition);
    },
    url: URL,
    cookie: COOKIE,
    timing: KEEP_ALIVE_TIMING,
    now: Date.now,
    log: silentLog,
  });

  return {
    ...fake,
    world,
    prepared,
    keepAlive,
    /** Which partitions have a page open now. */
    open: () =>
      fake.opened.filter((page) => !page.closed).map((page) => page.partition),
  };
};

describe(createKeepAlive, () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: START });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("checks a minute after launch, loading the page in the stale profile's guarded session, and closes it once the cookie rotates", async () => {
    const run = setup();

    await vi.advanceTimersByTimeAsync(MINUTE - 1);
    expect(run.open()).toStrictEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(run.opened).toStrictEqual([
      { partition: "persist:a", url: URL, closed: false },
    ]);
    expect(run.prepared).toStrictEqual(["persist:a"]);

    run.rotate("persist:a");
    expect(run.open()).toStrictEqual([]);

    // Fresh now, so the next checks leave it.
    await vi.advanceTimersByTimeAsync(DAY);
    expect(run.opened).toHaveLength(1);
  });

  it("checks hourly, so a cookie that turns two days old meanwhile is caught at the next check", async () => {
    const run = setup({
      expiries: { "persist:a": rotatedAgo(2 * DAY - 2 * HOUR) },
    });

    await vi.advanceTimersByTimeAsync(MINUTE + HOUR);
    expect(run.opened).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(run.open()).toStrictEqual(["persist:a"]);
  });

  it("closes a page that did not rotate after a minute, and tries that profile again an hour later", async () => {
    const run = setup();

    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(run.open()).toStrictEqual(["persist:a"]);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(run.open()).toStrictEqual([]);

    // The next check comes an hour after the first, a minute short of the retry.
    await vi.advanceTimersByTimeAsync(HOUR - MINUTE);
    expect(run.opened).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(run.open()).toStrictEqual(["persist:a"]);
  });

  it("runs one at a time, the stalest first, and the next as soon as one ends", async () => {
    const run = setup({
      ids: ["a", "b"],
      expiries: {
        "persist:a": rotatedAgo(3 * DAY),
        "persist:b": rotatedAgo(5 * DAY),
      },
    });

    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(run.open()).toStrictEqual(["persist:b"]);
    run.rotate("persist:b");
    expect(run.open()).toStrictEqual(["persist:a"]);
  });

  it("leaves a profile with a view, one signed out and every one while offline", async () => {
    const run = setup({
      ids: ["a", "b"],
      expiries: {
        "persist:a": rotatedAgo(3 * DAY),
        "persist:b": rotatedAgo(3 * DAY),
      },
    });

    run.world.withViews.add("a");
    run.world.signedOut.add("b");
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(run.opened).toHaveLength(0);

    run.world.withViews.clear();
    run.world.signedOut.clear();
    run.world.online = false;
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(run.opened).toHaveLength(0);

    run.world.online = true;
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(run.open()).toStrictEqual(["persist:a"]);
  });

  it("closes the page at once when the profile gets a view of its own, and does not count it as failed", async () => {
    const run = setup();

    await vi.advanceTimersByTimeAsync(MINUTE);
    run.world.withViews.add("a");
    run.keepAlive.follow();
    expect(run.open()).toStrictEqual([]);

    // Its view closes again before any rotation: due at the next check.
    run.world.withViews.clear();
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(run.open()).toStrictEqual(["persist:a"]);
  });

  it("follows a rotation any page makes, so a profile whose own tab rotated is not due", async () => {
    const run = setup();

    run.rotate("persist:a");
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(run.opened).toHaveLength(0);
  });

  it("closes a removed profile's page and stops watching its cookie, and watches an added one's", async () => {
    const run = setup();

    await vi.advanceTimersByTimeAsync(MINUTE);
    run.world.ids = ["b"];
    run.keepAlive.follow();
    expect([
      run.open(),
      run.watching("persist:a"),
      run.watching("persist:b"),
    ]).toStrictEqual([[], 0, 1]);
  });

  it("catches up a week of sleep at the first check after it", async () => {
    const run = setup({ expiries: { "persist:a": rotatedAgo(HOUR) } });

    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(run.opened).toHaveLength(0);

    // Timers stand still while the computer sleeps; the wall clock does not.
    vi.setSystemTime(Date.now() + 7 * DAY);
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(run.open()).toStrictEqual(["persist:a"]);
  });

  it("forgets when a profile's cookie rotated once it is removed, until it is set again", async () => {
    const run = setup();

    // Once the expiry at launch is read.
    await vi.advanceTimersByTimeAsync(0);
    run.remove("persist:a");
    await vi.advanceTimersByTimeAsync(DAY);
    expect(run.opened).toHaveLength(0);

    run.rotate("persist:a");
    vi.setSystemTime(Date.now() + 3 * DAY);
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(run.opened.map(({ partition }) => partition)).toStrictEqual([
      "persist:a",
    ]);
  });

  it("opens nothing of a profile never signed in", async () => {
    const run = setup({ expiries: {} });

    await vi.advanceTimersByTimeAsync(DAY);
    expect(run.opened).toHaveLength(0);
  });
});
