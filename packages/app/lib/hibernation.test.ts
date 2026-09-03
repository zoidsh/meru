import { describe, expect, test } from "bun:test";
import { ms } from "@meru/shared/ms";
import { canHibernateTab } from "./hibernation";

const now = new Date("2026-08-18T12:00:00Z").getTime();

const idleTimeout = ms("1h");

const idleTab = {
  isWindowed: false,
  isAudible: false,
  url: "https://calendar.google.com/",
  pinned: false,
  hibernatesWhenIdle: false,
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

  test("unloads a marked pinned tab while the sweep is on selected tabs", () => {
    expect(
      canHibernateTab({ ...idleTab, pinned: true, hibernatesWhenIdle: true }, sweepSelectedTabs),
    ).toBe(true);
  });
});
