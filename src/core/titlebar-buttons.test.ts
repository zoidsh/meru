import { describe, expect, it } from "vitest";

import { titlebarButtonsShown } from "./titlebar-buttons.ts";

const ALL = {
  sidebar: true,
  newTab: true,
  unifiedInbox: true,
  downloads: true,
  doNotDisturb: true,
};

const NONE = {
  sidebar: false,
  newTab: false,
  unifiedInbox: false,
  downloads: false,
  doNotDisturb: false,
};

const AT_REST = { sidebarShown: false, profileCount: 2, doNotDisturbOn: false };

describe(titlebarButtonsShown, () => {
  it("shows every button where it would show anyway", () => {
    expect(titlebarButtonsShown(ALL, AT_REST)).toStrictEqual(ALL);
  });

  it("hides each one turned off", () => {
    expect(titlebarButtonsShown(NONE, AT_REST)).toStrictEqual(NONE);
  });

  it("never shows New tab beside the sidebar or Unified inbox with one profile, whatever the choice", () => {
    expect(
      titlebarButtonsShown(ALL, {
        ...AT_REST,
        sidebarShown: true,
        profileCount: 1,
      })
    ).toStrictEqual({ ...ALL, newTab: false, unifiedInbox: false });
  });

  it("lets the sidebar's toggle show only where the sidebar may", () => {
    expect([
      titlebarButtonsShown(ALL, AT_REST).sidebar,
      titlebarButtonsShown({ ...ALL, sidebar: false }, AT_REST).sidebar,
    ]).toStrictEqual([true, false]);
  });

  it("shows Do Not Disturb's moon while it holds, hidden or not, and hides it again once it ends", () => {
    expect(
      [true, false].map(
        (doNotDisturbOn) =>
          titlebarButtonsShown(NONE, { ...AT_REST, doNotDisturbOn })
            .doNotDisturb
      )
    ).toStrictEqual([true, false]);
  });
});
