import { describe, expect, it } from "vitest";

import { gmailTab, isTab, newProfile } from "./state.ts";
import type { State, Tab } from "./state.ts";
import { planViews } from "./views.ts";

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
  sleeping: string[] = [],
  // Earlier Open at Launch tabs still loading, so another profile's wait.
  waiting = true
) =>
  planViews(current, existing, new Set(launched), new Set(sleeping), waiting);

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

  it("opens the next awake profile's Open at Launch tabs, every one, once no earlier ones are loading, one profile at a time and each only once", () => {
    const whileLoading = plan(state, ["a/gmail", "a/a1"], ["a"]);
    const toB = plan(state, ["a/gmail", "a/a1"], ["a"], [], false);
    const toC = plan(state, keys(toB.views), ["a", "b"], [], false);
    const done = plan(state, keys(toC.views), ["a", "b", "c"], [], false);

    expect([keys(whileLoading.opening), whileLoading.launched]).toStrictEqual([
      [],
      [],
    ]);
    expect([keys(toB.opening), toB.launched, keys(toB.views)]).toStrictEqual([
      ["b/gmail", "b/b2"],
      ["b"],
      ["a/gmail", "a/a1", "b/gmail", "b/b2"],
    ]);
    expect([keys(toC.opening), toC.launched]).toStrictEqual([[], ["c"]]);
    expect([keys(done.opening), done.launched]).toStrictEqual([[], []]);
  });

  it("opens a profile's Open at Launch tabs at once when it is selected before its turn, while others are loading", () => {
    const toB = plan(
      { ...state, selectedProfileId: "b" },
      ["a/gmail", "a/a1"],
      ["a"]
    );

    expect([keys(toB.opening), toB.launched, keys(toB.views)]).toStrictEqual([
      ["b/gmail", "b/b2"],
      ["b"],
      ["a/gmail", "a/a1", "b/gmail", "b/b1", "b/b2"],
    ]);
  });

  it("never opens a sleeping profile's Open at Launch tabs", () => {
    const asleepB: State = {
      ...state,
      profiles: state.profiles.map((profile) =>
        profile.id === "b" ? { ...profile, asleep: true } : profile
      ),
    };
    const next = plan(asleepB, ["a/gmail", "a/a1"], ["a"], [], false);

    expect([keys(next.opening), next.launched]).toStrictEqual([[], ["c"]]);
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

  it("gives a sleeping tab no view, on screen or opened at launch, and keeps it the front", () => {
    const asleepFront = plan(state, ["a/gmail"], ["a"], ["a/a1"]);
    const asleepAtLaunch = plan(state, [], [], ["a/gmail"]);

    expect([keys(asleepFront.views), asleepFront.front]).toStrictEqual([
      ["a/gmail"],
      { profileId: "a", tabId: "a1" },
    ]);
    expect(keys(asleepAtLaunch.views)).toStrictEqual(["a/a1"]);
  });

  it("gives a sleeping profile no view and opens none of its Open at Launch tabs, closing those it had, and reads the selected one awake", () => {
    const asleepA = {
      ...state,
      profiles: state.profiles.map((profile) =>
        profile.id === "a" ? { ...profile, asleep: true } : profile
      ),
    };
    const background = plan(
      { ...asleepA, selectedProfileId: "b" },
      ["a/gmail", "a/a1"],
      ["a"]
    );

    expect(keys(background.views)).toStrictEqual(["b/gmail", "b/b1", "b/b2"]);
    expect(keys(plan(asleepA).views)).toStrictEqual(keys(plan(state).views));
  });

  it("shows every pane of the split while the selected tab is in it, placed by its tree, and the tab alone outside it", () => {
    const root = {
      direction: "row" as const,
      children: [
        { size: 0.5, pane: "a1" },
        { size: 0.5, pane: "gmail" },
      ],
    };
    const split = (selectedTabId: string): State => ({
      ...state,
      profiles: state.profiles.map((profile) =>
        profile.id === "a"
          ? { ...profile, selectedTabId, splits: [{ root }] }
          : profile
      ),
    });
    const inside = plan(split("a1"), [], ["a"]);
    const outside = plan(split("a3"), ["a/gmail", "a/a1"], ["a"]);

    expect([
      keys(inside.shown),
      inside.panes,
      keys(inside.views),
    ]).toStrictEqual([["a/a1", "a/gmail"], root, ["a/gmail", "a/a1"]]);
    expect([
      keys(outside.shown),
      outside.panes,
      keys(outside.views),
    ]).toStrictEqual([["a/a3"], undefined, ["a/gmail", "a/a1", "a/a3"]]);
  });

  it("keeps a sleeping pane on screen without a view, so its placeholder shows in its place", () => {
    const root = {
      direction: "column" as const,
      children: [
        { size: 0.5, pane: "a1" },
        { size: 0.5, pane: "gmail" },
      ],
    };
    const split: State = {
      ...state,
      profiles: state.profiles.map((profile) =>
        profile.id === "a" ? { ...profile, splits: [{ root }] } : profile
      ),
    };
    const sleeping = plan(split, ["a/gmail", "a/a1"], ["a"], ["a/gmail"]);

    expect([keys(sleeping.shown), keys(sleeping.views)]).toStrictEqual([
      ["a/a1", "a/gmail"],
      ["a/a1"],
    ]);
  });

  it("gives a tab in its own window a view that never sleeps and is never the front, once its profile's Open at Launch tabs open", () => {
    const away: State = {
      ...state,
      profiles: state.profiles.map((profile) => ({
        ...profile,
        tabs: profile.tabs.map((each) =>
          isTab(each) && (each.id === "a1" || each.id === "b1")
            ? { ...each, ownWindow: true }
            : each
        ),
      })),
    };
    const first = plan(away, [], [], ["a/a1"]);
    const later = plan(away, ["a/gmail", "a/a1"], ["a", "b"], ["a/a1"]);

    expect([
      first.front,
      keys(first.windows),
      keys(first.views),
      keys(later.windows),
      keys(later.views),
    ]).toStrictEqual([
      undefined,
      ["a/a1"],
      ["a/gmail", "a/a1"],
      ["a/a1", "b/b1"],
      ["a/gmail", "a/a1", "b/b1"],
    ]);
  });

  it("gives a sleeping profile's tab in its own window no window", () => {
    const away: State = {
      ...state,
      profiles: state.profiles.map((profile) =>
        profile.id === "b"
          ? {
              ...profile,
              asleep: true,
              tabs: profile.tabs.map((each) =>
                isTab(each) && each.id === "b1"
                  ? { ...each, ownWindow: true }
                  : each
              ),
            }
          : profile
      ),
    };

    expect(keys(plan(away, [], ["a", "b"]).windows)).toStrictEqual([]);
  });

  it("never gives a tab of an app this build does not know a view", () => {
    expect(keys(plan(state, ["a/a2"], ["a"]).views)).toStrictEqual(["a/a1"]);
  });
});
