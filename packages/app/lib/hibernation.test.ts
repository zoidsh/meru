import { describe, expect, test } from "bun:test";
import { ms } from "@meru/shared/ms";
import { canHibernateTab } from "./hibernation";

const now = new Date("2026-08-18T12:00:00Z").getTime();

const idleTimeout = ms("1h");

const idleTab = {
  isWindowed: false,
  isAudible: false,
  url: "https://calendar.google.com/",
  hibernatesWhenIdle: false,
  lastActiveAt: now - ms("2h"),
};

const sweepEveryTab = { hibernatesEveryTab: true, idleTimeout, now };

const sweepSelectedTabs = { hibernatesEveryTab: false, idleTimeout, now };

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

  test("unloads only marked tabs while the sweep is on selected tabs", () => {
    expect(canHibernateTab(idleTab, sweepSelectedTabs)).toBe(false);
    expect(canHibernateTab({ ...idleTab, hibernatesWhenIdle: true }, sweepSelectedTabs)).toBe(true);
  });
});
