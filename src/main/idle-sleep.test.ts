import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SLEEP_AFTER_MS, SOUND_RECHECK_MS } from "#core/idle-sleep.ts";
import type { SleepAfter, SleepIdleTabs } from "#core/settings.ts";
import { gmailTab, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import { tabKey } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";

import { createIdleSleep } from "./idle-sleep.ts";
import { createProfiles } from "./profiles.ts";

const HOUR = SLEEP_AFTER_MS["1h"];

const START = Date.UTC(2026, 10, 26, 9);

const calendar = { profileId: "p", tabId: "c" };

/** Gmail, selected, a Calendar tab and a pinned Drive tab. */
const initial: State = {
  version: 1,
  profiles: [
    {
      ...newProfile("p", "Default"),
      tabs: [
        gmailTab(),
        {
          id: "c",
          app: "calendar",
          url: "https://calendar.google.com/",
          title: "Week",
        },
        {
          id: "d",
          app: "drive",
          url: "https://drive.google.com/",
          title: "Drive",
          pinned: true,
        },
      ],
      selectedTabId: "gmail",
    },
  ],
  selectedProfileId: "p",
};

/**
 * The real profiles, a page for every tab as if each had been opened, which
 * Sleep takes away and selecting gives back, and the settings as the test
 * sets them, followed as main follows them.
 */
const setup = ({ which = "unpinned" as SleepIdleTabs } = {}) => {
  const profiles = createProfiles({
    initial,
    save: () => Promise.resolve(),
    newId: () => "new",
    profileName: (n) => `Profile ${n}`,
    clearSession: () => Promise.resolve(),
    now: Date.now,
    log: () => false,
  });
  const pages = new Set(
    ["gmail", "c", "d"].map((tabId) => tabKey({ profileId: "p", tabId }))
  );
  const sounding = new Set<string>();
  const slept: string[] = [];
  const settings: { which: SleepIdleTabs; after: SleepAfter } = {
    which,
    after: "1h",
  };
  const idle = createIdleSleep({
    state: profiles.get,
    which: () => settings.which,
    after: () => settings.after,
    hasPage: (key) => pages.has(tabKey(key)),
    audible: (key) => sounding.has(tabKey(key)),
    sleep: (key) => {
      slept.push(tabKey(key));
      pages.delete(tabKey(key));
    },
    now: Date.now,
  });

  profiles.onChange((state) => {
    for (const profile of state.profiles) {
      pages.add(
        tabKey({ profileId: profile.id, tabId: profile.selectedTabId })
      );
    }

    idle.follow();
  });
  idle.follow();

  return {
    profiles,
    idle,
    slept,
    sounding,
    select: (key: TabKey) => profiles.selectTab(key),
    set: (change: Partial<typeof settings>) => {
      Object.assign(settings, change);
      idle.follow();
    },
  };
};

describe(createIdleSleep, () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: START });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("puts a hidden tab to sleep at the chosen time and not before, then sets no timer with nothing left to sleep", async () => {
    const { slept } = setup();

    await vi.advanceTimersByTimeAsync(HOUR - 1);

    expect(slept).toStrictEqual([]);

    await vi.advanceTimersByTimeAsync(1);

    expect(slept).toStrictEqual(["p/c"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("restarts the clock of a tab selected in between, from when it is hidden again", async () => {
    const { slept, select } = setup();

    await vi.advanceTimersByTimeAsync(HOUR / 2);
    await select(calendar);
    await vi.advanceTimersByTimeAsync(HOUR);

    expect(slept).toStrictEqual([]);

    await select({ profileId: "p", tabId: "gmail" });
    await vi.advanceTimersByTimeAsync(HOUR - 1);

    expect(slept).toStrictEqual([]);

    await vi.advanceTimersByTimeAsync(1);

    expect(slept).toStrictEqual(["p/c"]);
  });

  it("applies a shorter time to tabs already idle at once, and a change of which tabs to those already idle", async () => {
    const { slept, set } = setup();

    await vi.advanceTimersByTimeAsync(SLEEP_AFTER_MS["30m"] + 5);

    expect(slept).toStrictEqual([]);

    set({ after: "30m" });

    expect(slept).toStrictEqual(["p/c"]);

    set({ which: "all" });

    expect(slept).toStrictEqual(["p/c", "p/d"]);
  });

  it("sets no timer while no tab can sleep, and one once a setting lets a tab", async () => {
    const { set, slept } = setup({ which: "chosen" });

    expect(vi.getTimerCount()).toBe(0);

    set({ which: "all" });

    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(HOUR);

    expect(slept).toStrictEqual(["p/c", "p/d"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a tab playing sound awake past its time and puts it to sleep once it falls silent", async () => {
    const { slept, sounding } = setup();

    sounding.add("p/c");
    await vi.advanceTimersByTimeAsync(HOUR + SOUND_RECHECK_MS);

    expect(slept).toStrictEqual([]);

    sounding.delete("p/c");
    await vi.advanceTimersByTimeAsync(SOUND_RECHECK_MS);

    expect(slept).toStrictEqual(["p/c"]);
  });

  it("counts the time the computer slept as idle once it wakes", () => {
    const { idle, slept } = setup();

    // The clock jumps, as it does over a sleep no timer counted.
    vi.setSystemTime(START + HOUR);
    idle.follow();

    expect(slept).toStrictEqual(["p/c"]);
  });

  it("sets no timer once disposed", () => {
    const { idle } = setup();

    idle.dispose();

    expect(vi.getTimerCount()).toBe(0);
  });
});
