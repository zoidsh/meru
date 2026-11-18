import { describe, expect, it } from "vitest";

import { gmailTab, newProfile } from "./state.ts";
import type { State, Tab } from "./state.ts";
import { opensLaunchTabs, planViews } from "./views.ts";

const tab = (id: string, app = "calendar", pins: Partial<Tab> = {}): Tab => ({
  id,
  app,
  url: "",
  title: "",
  ...pins,
});

const asleep = { pinned: true, openAtLaunch: false };

const state: State = {
  version: 1,
  profiles: [
    {
      ...newProfile("a", "Default"),
      tabs: [
        gmailTab(),
        tab("a1"),
        tab("a2", "tasks"),
        tab("a3", "drive", asleep),
      ],
      selectedTabId: "a1",
    },
    {
      ...newProfile("b", "Profile 2"),
      tabs: [
        gmailTab(),
        tab("b1"),
        tab("b2", "docs", { pinned: true, openAtLaunch: true }),
      ],
      selectedTabId: "b1",
    },
    { ...newProfile("c", "Profile 3"), tabs: [], selectedTabId: "" },
  ],
  selectedProfileId: "a",
};

const keys = (list: readonly { profileId: string; tabId: string }[]) =>
  list.map(({ profileId, tabId }) => `${profileId}/${tabId}`);

const plan = (
  current: State,
  existing: string[] = [],
  launched: string[] = [],
  opensLaunch = opensLaunchTabs
) => planViews(current, existing, new Set(launched), opensLaunch);

describe(planViews, () => {
  it("at first gives the selected tab a view and opens the selected profile's Open at Launch tabs alone", () => {
    const first = plan(state);

    expect([
      keys(first.views),
      first.front,
      keys(first.opening),
      first.launched,
    ]).toStrictEqual([
      ["a/gmail", "a/a1"],
      { profileId: "a", tabId: "a1" },
      ["a/gmail"],
      ["a"],
    ]);
  });

  it("opens another profile's Open at Launch tabs, every one, when it is first selected, and a profile's only once", () => {
    const toB = plan(
      { ...state, selectedProfileId: "b" },
      ["a/gmail", "a/a1"],
      ["a"]
    );
    const backToA = plan(state, keys(toB.views), ["a", "b"]);

    expect([keys(toB.opening), toB.launched, keys(toB.views)]).toStrictEqual([
      ["b/gmail", "b/b2"],
      ["b"],
      ["a/gmail", "a/a1", "b/gmail", "b/b1", "b/b2"],
    ]);
    expect([keys(backToA.opening), backToA.launched]).toStrictEqual([[], []]);
  });

  it("opens every profile's at launch when the predicate says so, as v3 did", () => {
    expect(keys(plan(state, [], [], () => true).opening)).toStrictEqual([
      "a/gmail",
      "b/gmail",
      "b/b2",
    ]);
  });

  it("has no front for a profile with no tab", () => {
    const empty = plan({ ...state, selectedProfileId: "c" }, [], ["a", "b"]);

    expect([keys(empty.views), empty.front]).toStrictEqual([[], undefined]);
  });

  it("drops the view of a closed tab and of every tab of a removed profile", () => {
    const after = plan(
      {
        ...state,
        profiles: [{ ...newProfile("a", "Default"), selectedTabId: "gmail" }],
      },
      ["a/a1", "a/gmail", "b/gmail", "b/b1"],
      ["a", "b"]
    );

    expect(keys(after.views)).toStrictEqual(["a/gmail"]);
  });

  it("never gives a tab of an app this build does not know a view", () => {
    expect(keys(plan(state, ["a/a2"], ["a"]).views)).toStrictEqual(["a/a1"]);
  });
});
