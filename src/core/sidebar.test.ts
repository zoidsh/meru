import { describe, expect, it } from "vitest";

import {
  keepsOverride,
  sidebarRule,
  sidebarState,
  sidebarWidth,
  toggleShown,
  toggleWidth,
} from "./sidebar.ts";
import { gmailTab, newProfile } from "./state.ts";
import type { State } from "./state.ts";

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
  it("is 0, 64 or 224", () => {
    expect(
      (["hidden", "narrow", "wide"] as const).map(sidebarWidth)
    ).toStrictEqual([0, 64, 224]);
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
        ])
      )
    ).toBeTruthy();
  });

  it("lapses when a tab opens or closes, or another profile is selected", () => {
    expect([
      keepsOverride(state, withTabs([gmailTab()])),
      keepsOverride(
        state,
        withTabs([
          ...(state.profiles[0]?.tabs ?? []),
          { id: "d1", app: "docs", url: "", title: "" },
        ])
      ),
      keepsOverride(state, { ...state, selectedProfileId: "b" }),
    ]).toStrictEqual([false, false, false]);
  });
});
