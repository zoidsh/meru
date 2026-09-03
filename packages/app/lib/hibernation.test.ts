import { describe, expect, test } from "bun:test";
import { ms } from "@meru/shared/ms";
import { canHibernateTab, hibernatesTabWhenIdle } from "./hibernation";

const now = new Date("2026-08-18T12:00:00Z").getTime();

const idleTimeout = ms("1h");

const idleTab = {
  isWindowed: false,
  isAudible: false,
  url: "https://calendar.google.com/",
  pinned: false,
  hibernatesWhenIdle: null,
  lastActiveAt: now - ms("2h"),
};

const sweepEveryTab = { hibernation: "all", idleTimeout, now } as const;

const sweepUnpinnedTabs = { hibernation: "unpinned", idleTimeout, now } as const;

const sweepSelectedTabs = { hibernation: "selected", idleTimeout, now } as const;

describe("canHibernateTab", () => {
  test("unloads a tab idle past the timeout", () => {
    expect(canHibernateTab(idleTab, sweepEveryTab)).toBe(true);
  });

  test("keeps a tab used within the timeout", () => {
    expect(canHibernateTab({ ...idleTab, lastActiveAt: now - ms("30m") }, sweepEveryTab)).toBe(
      false,
    );
  });

  test("unloads a tab at the timeout itself", () => {
    expect(canHibernateTab({ ...idleTab, lastActiveAt: now - idleTimeout }, sweepEveryTab)).toBe(
      true,
    );
  });

  test("keeps a tab in its own window", () => {
    expect(canHibernateTab({ ...idleTab, isWindowed: true }, sweepEveryTab)).toBe(false);
  });

  test("keeps a tab playing audio", () => {
    expect(canHibernateTab({ ...idleTab, isAudible: true }, sweepEveryTab)).toBe(false);
  });

  test("keeps a tab that never arrived anywhere", () => {
    expect(canHibernateTab({ ...idleTab, url: "" }, sweepEveryTab)).toBe(false);
  });

  test("unloads a pinned tab while the sweep is on every tab", () => {
    expect(canHibernateTab({ ...idleTab, pinned: true }, sweepEveryTab)).toBe(true);
  });

  test("keeps a pinned tab while the sweep is on unpinned tabs", () => {
    expect(canHibernateTab(idleTab, sweepUnpinnedTabs)).toBe(true);
    expect(canHibernateTab({ ...idleTab, pinned: true }, sweepUnpinnedTabs)).toBe(false);
  });

  test("unloads only marked tabs while the sweep is on selected tabs", () => {
    expect(canHibernateTab(idleTab, sweepSelectedTabs)).toBe(false);
    expect(canHibernateTab({ ...idleTab, hibernatesWhenIdle: true }, sweepSelectedTabs)).toBe(true);
  });

  test("unloads a tab marked in, whichever tabs the sweep is on", () => {
    const markedInTab = { ...idleTab, pinned: true, hibernatesWhenIdle: true };

    expect(canHibernateTab(markedInTab, sweepUnpinnedTabs)).toBe(true);
    expect(canHibernateTab(markedInTab, sweepSelectedTabs)).toBe(true);
  });

  test("keeps a tab marked out, whichever tabs the sweep is on", () => {
    const markedOutTab = { ...idleTab, hibernatesWhenIdle: false };

    expect(canHibernateTab(markedOutTab, sweepEveryTab)).toBe(false);
    expect(canHibernateTab(markedOutTab, sweepUnpinnedTabs)).toBe(false);
  });
});

describe("hibernatesTabWhenIdle", () => {
  const unmarkedTab = { pinned: false, hibernatesWhenIdle: null };

  test("follows the setting while the tab carries no mark", () => {
    expect(hibernatesTabWhenIdle(unmarkedTab, "all")).toBe(true);
    expect(hibernatesTabWhenIdle(unmarkedTab, "unpinned")).toBe(true);
    expect(hibernatesTabWhenIdle({ ...unmarkedTab, pinned: true }, "unpinned")).toBe(false);
    expect(hibernatesTabWhenIdle(unmarkedTab, "selected")).toBe(false);
  });

  test("takes the mark over the setting either way", () => {
    expect(hibernatesTabWhenIdle({ pinned: true, hibernatesWhenIdle: true }, "unpinned")).toBe(
      true,
    );
    expect(hibernatesTabWhenIdle({ pinned: false, hibernatesWhenIdle: false }, "all")).toBe(false);
  });
});
