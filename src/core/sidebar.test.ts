import { describe, expect, it } from "vitest";

import {
  keepsOverride,
  sidebarRule,
  sidebarState,
  sidebarTabs,
  sidebarWidth,
  toggleShown,
  toggleWidth,
} from "./sidebar.ts";
import { gmailTab, newProfile } from "./state.ts";
import type { State } from "./state.ts";
import { titlebarStart } from "./titlebar.ts";

const apps = (...names: string[]) =>
  names.map((app, index) => ({ id: `t${index}`, app, url: "", title: "" }));

describe(sidebarRule, () => {
  it("hides the sidebar for one tab or none", () => {
    expect([sidebarRule([]), sidebarRule(apps("gmail"))]).toStrictEqual([
      "hidden",
      "hidden",
    ]);
  });

  it("is narrow for tabs of different apps, and wide once an app has two", () => {
    expect([
      sidebarRule(apps("gmail", "calendar")),
      sidebarRule(apps("gmail", "calendar", "docs")),
      sidebarRule(apps("gmail", "docs", "docs")),
    ]).toStrictEqual(["narrow", "narrow", "wide"]);
  });

  it("counts a pinned tab toward shown but not toward wide", () => {
    const onePinned = apps("docs", "docs").map((tab, index) => ({
      ...tab,
      pinned: index === 1,
    }));

    expect([
      sidebarRule(onePinned),
      sidebarRule([{ ...gmailTab() }]),
    ]).toStrictEqual(["narrow", "hidden"]);
  });
});

describe(sidebarState, () => {
  it("follows the rule with no choice made", () => {
    expect(sidebarState(apps("gmail", "docs", "docs"), {})).toBe("wide");
  });

  it("hides by hand whatever the rule says", () => {
    expect(sidebarState(apps("gmail", "docs", "docs"), { shown: false })).toBe(
      "hidden"
    );
  });

  it("shows narrow by hand where the rule hides, and at the width chosen", () => {
    expect([
      sidebarState(apps("gmail"), { shown: true }),
      sidebarState(apps("gmail"), { shown: true, width: "wide" }),
    ]).toStrictEqual(["narrow", "wide"]);
  });

  it("takes the width chosen over the rule's", () => {
    expect([
      sidebarState(apps("gmail", "docs"), { width: "wide" }),
      sidebarState(apps("gmail", "docs", "docs"), { width: "narrow" }),
    ]).toStrictEqual(["wide", "narrow"]);
  });
});

describe(sidebarWidth, () => {
  it("is 0, 64 or 224 where the toggle starts at the window's edge", () => {
    expect(
      (["hidden", "narrow", "wide"] as const).map((state) => [
        sidebarWidth(state, "win32"),
        sidebarWidth(state, "linux"),
      ])
    ).toStrictEqual([
      [0, 0],
      [64, 64],
      [224, 224],
    ]);
  });

  it("is narrow as wide as the titlebar's start on macOS, so the page lines up with the sidebar toggle", () => {
    expect([
      sidebarWidth("hidden", "darwin"),
      sidebarWidth("narrow", "darwin"),
      sidebarWidth("wide", "darwin"),
    ]).toStrictEqual([0, titlebarStart("darwin"), 224]);
    expect(titlebarStart("darwin")).toBe(80);
  });
});

describe("the toggles", () => {
  it("show what is hidden and hide what shows", () => {
    expect([
      toggleShown("hidden", {}),
      toggleShown("narrow", { width: "narrow" }),
    ]).toStrictEqual([{ shown: true }, { shown: false, width: "narrow" }]);
  });

  it("switch narrow and wide", () => {
    expect([
      toggleWidth("narrow", { shown: true }),
      toggleWidth("wide", {}),
    ]).toStrictEqual([{ shown: true, width: "wide" }, { width: "narrow" }]);
  });
});

/** Gmail, and two Calendar tabs each in a window of its own. */
const windowed: State = {
  version: 1,
  profiles: [
    {
      ...newProfile("a", "Default"),
      tabs: [
        gmailTab(),
        { id: "c1", app: "calendar", url: "", title: "", ownWindow: true },
        { id: "c2", app: "calendar", url: "", title: "", ownWindow: true },
      ],
    },
    newProfile("b", "Work"),
  ],
  selectedProfileId: "a",
};

describe(sidebarTabs, () => {
  it("gives the selected profile's tabs the sidebar lists, which the rule counts: Gmail alone and its own windows open no column while Show windows in the sidebar is off", () => {
    const ids = (showWindows: boolean) =>
      sidebarTabs(windowed, showWindows).map((tab) => tab.id);

    expect([
      ids(true),
      ids(false),
      sidebarRule(sidebarTabs(windowed, true)),
      sidebarRule(sidebarTabs(windowed, false)),
    ]).toStrictEqual([["gmail", "c1", "c2"], ["gmail"], "wide", "hidden"]);
  });
});

describe(keepsOverride, () => {
  const state: State = {
    version: 1,
    profiles: [
      {
        ...newProfile("a", "Default"),
        tabs: [gmailTab(), { id: "c1", app: "calendar", url: "", title: "" }],
      },
      newProfile("b", "Work"),
    ],
    selectedProfileId: "a",
  };
  const withTabs = (tabs: State["profiles"][number]["tabs"]): State => ({
    ...state,
    profiles: state.profiles.map((profile) =>
      profile.id === "a" ? { ...profile, tabs } : profile
    ),
  });

  it("holds while the selected profile's tabs stay, reordered or retitled", () => {
    expect(
      keepsOverride(
        state,
        withTabs([
          { id: "c1", app: "calendar", url: "x", title: "Week" },
          gmailTab(),
        ]),
        true
      )
    ).toBeTruthy();
  });

  it("lapses when a tab opens or closes, or another profile is selected", () => {
    expect([
      keepsOverride(state, withTabs([gmailTab()]), true),
      keepsOverride(
        state,
        withTabs([
          ...(state.profiles[0]?.tabs ?? []),
          { id: "d1", app: "docs", url: "", title: "" },
        ]),
        true
      ),
      keepsOverride(state, { ...state, selectedProfileId: "b" }, true),
    ]).toStrictEqual([false, false, false]);
  });

  it("holds as a tab the sidebar leaves out closes, and lapses as one it lists does", () => {
    const [profile] = windowed.profiles;
    const without = (tabId: string): State => ({
      ...windowed,
      profiles: profile
        ? [
            {
              ...profile,
              tabs: profile.tabs.filter(
                (tab) => !("id" in tab) || tab.id !== tabId
              ),
            },
          ]
        : [],
    });

    expect([
      keepsOverride(windowed, without("c1"), false),
      keepsOverride(windowed, without("c1"), true),
    ]).toStrictEqual([true, false]);
  });
});
