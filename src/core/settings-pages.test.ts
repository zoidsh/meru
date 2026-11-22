import { describe, expect, it } from "vitest";

import {
  FIRST_SETTINGS_HISTORY,
  currentSettingsPage,
  openSettingsPage,
  stepSettingsPage,
  withListedProfiles,
} from "./settings-pages.ts";
import type { SettingsPage } from "./settings-pages.ts";

const notifications: SettingsPage = {
  section: "notifications",
  profileId: null,
};
const list: SettingsPage = { section: "profiles", profileId: null };
const pageOf = (profileId: string): SettingsPage => ({
  section: "profiles",
  profileId,
});

const visit = (...pages: SettingsPage[]) => {
  let history = FIRST_SETTINGS_HISTORY;

  for (const page of pages) {
    history = openSettingsPage(history, page) ?? history;
  }

  return history;
};

describe(openSettingsPage, () => {
  it("adds the page after the one shown, dropping the pages ahead of it", () => {
    const back = stepSettingsPage(visit(list, pageOf("a")), -1);

    expect(back && openSettingsPage(back, pageOf("b"))).toStrictEqual({
      pages: [notifications, list, pageOf("b")],
      at: 2,
    });
  });

  it("does nothing for the page shown", () => {
    expect(openSettingsPage(visit(list), list)).toBeUndefined();
  });
});

describe(stepSettingsPage, () => {
  it("goes back and forward, and nowhere past either end", () => {
    const history = visit(list, pageOf("a"));
    const back = stepSettingsPage(history, -1);

    expect([
      back && currentSettingsPage(back),
      back && stepSettingsPage(back, 1)?.at,
      stepSettingsPage(history, 1),
      stepSettingsPage(FIRST_SETTINGS_HISTORY, -1),
    ]).toStrictEqual([list, 2, undefined, undefined]);
  });
});

describe(withListedProfiles, () => {
  it("reads a removed profile's page as the list, made one with the list before it", () => {
    expect(
      withListedProfiles(visit(list, pageOf("a"), notifications), ["b"])
    ).toStrictEqual({ pages: [notifications, list, notifications], at: 2 });
  });

  it("shows the list in place of the removed profile's page it was on", () => {
    const history = visit(list, pageOf("a"), list, pageOf("b"));

    expect(withListedProfiles({ ...history, at: 2 }, ["a"])).toStrictEqual({
      pages: [notifications, list, pageOf("a"), list],
      at: 2,
    });
    expect(withListedProfiles(history, ["a"])).toStrictEqual({
      pages: [notifications, list, pageOf("a"), list],
      at: 3,
    });
  });

  it("gives back the same history while every page's profile is listed", () => {
    const history = visit(list, pageOf("a"));

    expect(withListedProfiles(history, ["a", "b"])).toBe(history);
  });
});
