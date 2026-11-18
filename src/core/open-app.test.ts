import { describe, expect, it } from "vitest";

import { APPS } from "./apps.ts";
import {
  afterRemoving,
  bookmarkOfValue,
  filterApps,
  launcherItems,
  openableApps,
  splittableApps,
} from "./open-app.ts";
import { gmailTab, newProfile } from "./state.ts";

const ids = (apps: readonly { id: string }[]) => apps.map((app) => app.id);

describe(openableApps, () => {
  it("lists every app in the registry's order but a single-instance one the profile has", () => {
    expect(ids(openableApps(APPS, newProfile("a", "Default")))).toStrictEqual([
      "calendar",
      "drive",
      "docs",
      "sheets",
      "slides",
      "meet",
    ]);
  });

  it("lists an app the profile has a tab of when it may have more than one", () => {
    const profile = {
      tabs: [{ id: "c1", app: "calendar", url: "", title: "" }],
    };

    expect(ids(openableApps(APPS, profile))).toStrictEqual([
      "gmail",
      "calendar",
      "drive",
      "docs",
      "sheets",
      "slides",
      "meet",
    ]);
  });

  it("goes by the rule, not by the app", () => {
    const apps = [
      { id: "gmail", singleInstance: false },
      { id: "calendar", singleInstance: true },
    ] as const;
    const profile = {
      tabs: [gmailTab(), { id: "c1", app: "calendar", url: "", title: "" }],
    };

    expect(ids(openableApps(apps, profile))).toStrictEqual(["gmail"]);
  });
});

const half = (a: string, b: string) => ({
  root: {
    direction: "row" as const,
    children: [
      { size: 0.5, pane: a },
      { size: 0.5, pane: b },
    ],
  },
});

describe(splittableApps, () => {
  const profile = {
    tabs: [
      gmailTab(),
      { id: "c1", app: "calendar", url: "", title: "" },
      { id: "d1", app: "drive", url: "", title: "" },
      { id: "m1", app: "meet", url: "", title: "" },
    ],
    splits: [half("gmail", "c1"), half("d1", "m1")],
  };
  const apps = [
    { id: "gmail", singleInstance: true },
    { id: "calendar", singleInstance: true },
    { id: "drive", singleInstance: true },
  ] as const;

  it("lists a single-instance app whose tab is in another split, to move it here, but not one in the shown split", () => {
    expect([
      ids(splittableApps(apps, { ...profile, selectedTabId: "c1" })),
      ids(splittableApps(apps, { ...profile, selectedTabId: "m1" })),
    ]).toStrictEqual([["drive"], ["gmail", "calendar"]]);
  });
});

describe(filterApps, () => {
  it("keeps the apps whose name holds what was typed, in any case, in their order", () => {
    expect(
      ["", "s", "DO", " sheets ", "x"].map((query) =>
        ids(filterApps(APPS, query))
      )
    ).toStrictEqual([
      ids(APPS),
      ["docs", "sheets", "slides"],
      ["docs"],
      ["sheets"],
      [],
    ]);
  });
});

describe(launcherItems, () => {
  const apps = [
    { id: "calendar", name: "Calendar" },
    { id: "docs", name: "Docs" },
  ];
  const bookmarks = [
    { id: "w", title: "Week", appName: "Calendar" },
    { id: "p", title: "Plan", appName: "Docs" },
    { id: "d", title: "Docs style guide", appName: "Drive" },
  ];
  const listed = (query: string) => {
    const items = launcherItems(apps, bookmarks, query);

    return [ids(items.apps), ids(items.bookmarks)];
  };

  it("lists every app and bookmark for nothing typed, in their order", () => {
    expect(listed(" ")).toStrictEqual([
      ["calendar", "docs"],
      ["w", "p", "d"],
    ]);
  });

  it("keeps the apps by name and the bookmarks by title or app's name, in any case", () => {
    expect(["docs", "WEEK", "drive", "x"].map(listed)).toStrictEqual([
      [["docs"], ["p", "d"]],
      [[], ["w"]],
      [[], ["d"]],
      [[], []],
    ]);
  });
});

describe(afterRemoving, () => {
  const values = ["app:calendar", "bookmark:a", "bookmark:b", "bookmark:c"];

  it("moves to the next item, else the one before, else none", () => {
    expect([
      afterRemoving(values, "a"),
      afterRemoving(values, "c"),
      afterRemoving(["bookmark:a"], "a"),
    ]).toStrictEqual(["bookmark:b", "bookmark:b", ""]);
  });

  it("moves to the first item for a bookmark not listed", () => {
    expect([
      afterRemoving(values, "gone"),
      afterRemoving([], "gone"),
    ]).toStrictEqual(["app:calendar", ""]);
  });
});

describe(bookmarkOfValue, () => {
  it("gives a bookmark item's id, and nothing for an app's", () => {
    expect([
      bookmarkOfValue("bookmark:a"),
      bookmarkOfValue("app:calendar"),
    ]).toStrictEqual(["a", undefined]);
  });
});
