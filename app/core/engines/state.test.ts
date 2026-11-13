import { describe, expect, it } from "vitest";

import { fakeIds } from "../../test/fakes/ids.ts";
import { PROFILE_COLORS } from "../records/profile.ts";
import type { ProfilesState } from "../records/profiles-state.ts";
import type { Tab } from "../records/tab.ts";
import { leaf, panes } from "./layout.ts";
import {
  addProfile,
  addTab,
  closeTab,
  colorFor,
  createGroup,
  firstGroup,
  freshState,
  leaveGroup,
  removeProfile,
  repairState,
  resizeSplit,
  selectProfile,
  splitInto,
  validateState,
} from "./state.ts";

const tabOf = (id: string, profileId: string): Tab => ({
  appId: "gmail",
  health: "ok",
  id,
  pinned: false,
  profileId,
  sleeping: false,
  title: id,
  url: "https://mail.google.com/",
  zoom: 1,
});

const profile = (id: string, order = 0) => ({
  id,
  label: id,
  order,
  status: { kind: "ok" as const },
});

const unwrap = <T>(
  result: { ok: true; value: T } | { ok: false; error: unknown }
): T => {
  if (!result.ok) {
    throw new Error(`Expected a change, got ${String(result.error)}`);
  }
  return result.value;
};

const start = () => {
  const ids = fakeIds("n");
  const state = freshState(profile("a"), tabOf("t1", "a"), ids);
  return { ids, state };
};

describe(validateState, () => {
  it("accepts a fresh state", () => {
    expect(validateState(start().state)).toStrictEqual([]);
  });

  it("names every broken invariant", () => {
    const { state } = start();
    const [group] = state.groups;
    if (group === undefined) {
      throw new Error("A fresh state has a group");
    }
    const broken: ProfilesState = {
      groups: [
        group,
        { ...group, id: "g2", layout: leaf("p9", "t9"), tabIds: ["t1", "t1"] },
        { id: "g3", layout: leaf("p8", "t2"), profileId: "z", tabIds: [] },
      ],
      profiles: [...state.profiles, profile("b", 1)],
      selectedProfileId: "missing",
      tabs: [...state.tabs, tabOf("t3", "z")],
    };
    expect(validateState(broken)).toStrictEqual([
      "the selected profile missing is missing",
      "tab t1 is in 2 groups",
      "tab t3 belongs to no profile",
      "tab t3 is in 0 groups",
      "group g2 lists tab t1 more than once",
      "group g2's layout does not show its tabs",
      "group g3 belongs to no profile",
      "group g3 is empty",
      "group g3's layout does not show its tabs",
      "profile b has no tab",
    ]);
    expect(
      validateState({ ...state, groups: [group, group] }).slice(0, 2)
    ).toStrictEqual([
      "group n1 appears more than once",
      "pane n2 appears more than once",
    ]);
  });
});

describe("the state's operations", () => {
  it("splits a new tab into a group's pane and closes it back to a group of one", () => {
    const { ids, state } = start();
    const [group] = state.groups;
    const [pane] = panes(group?.layout ?? null);
    if (group === undefined || pane === undefined) {
      throw new Error("A fresh state has a group with a pane");
    }
    const split = unwrap(
      addTab(state, tabOf("t2", "a"), ids, {
        groupId: group.id,
        orientation: "vertical",
        paneId: pane.paneId,
      })
    );
    expect(validateState(split)).toStrictEqual([]);
    expect(split.groups.map((found) => found.tabIds)).toStrictEqual([
      ["t1", "t2"],
    ]);
    const closed = unwrap(closeTab(split, "t2"));
    expect(validateState(closed)).toStrictEqual([]);
    expect(closed.groups).toStrictEqual([group]);
    expect(closeTab(closed, "t1")).toStrictEqual({
      error: "lastTab",
      ok: false,
    });
  });

  it("makes a group of tabs alone in theirs, and lets one leave it", () => {
    const { ids, state } = start();
    const more = unwrap(
      addTab(
        unwrap(addTab(state, tabOf("t2", "a"), ids)),
        tabOf("t3", "a"),
        ids
      )
    );
    const made = unwrap(
      createGroup(more, ["t1", "t2", "t3"], "horizontal", ids)
    );
    expect(validateState(made.state)).toStrictEqual([]);
    expect(createGroup(made.state, ["t2"], "vertical", ids)).toStrictEqual({
      error: "alreadyGrouped",
      ok: false,
    });
    const left = unwrap(leaveGroup(made.state, "t2", ids));
    expect({
      groups: left.groups.map((group) => group.tabIds),
      problems: validateState(left),
    }).toStrictEqual({ groups: [["t1", "t3"], ["t2"]], problems: [] });
    expect(leaveGroup(left, "t2", ids)).toStrictEqual({
      error: "notGrouped",
      ok: false,
    });
  });

  it("refuses to join a group of another profile, or a pane it does not have", () => {
    const { ids, state } = start();
    const two = addProfile(state, profile("b"), tabOf("t2", "b"), ids);
    const [first] = two.groups;
    if (first === undefined) {
      throw new Error("A fresh state has a group");
    }
    expect(
      splitInto(
        two,
        "t2",
        { groupId: first.id, orientation: "vertical", paneId: "n2" },
        ids
      )
    ).toStrictEqual({ error: "otherProfile", ok: false });
    const three = unwrap(addTab(two, tabOf("t3", "a"), ids));
    expect(
      splitInto(
        three,
        "t3",
        { groupId: first.id, orientation: "vertical", paneId: "nope" },
        ids
      )
    ).toStrictEqual({ error: "unknownPane", ok: false });
  });

  it("removes a profile with its tabs and groups, moving the selection, but never the last one", () => {
    const { ids, state } = start();
    const two = addProfile(state, profile("b"), tabOf("t2", "b"), ids);
    expect(two.profiles.map((found) => found.order)).toStrictEqual([0, 1]);
    const selected = unwrap(selectProfile(two, "b"));
    const removed = unwrap(removeProfile(selected, "b"));
    expect({
      problems: validateState(removed),
      selected: removed.selectedProfileId,
      tabs: removed.tabs.map((tab) => tab.id),
    }).toStrictEqual({ problems: [], selected: "a", tabs: ["t1"] });
    expect(removeProfile(removed, "a")).toStrictEqual({
      error: "lastProfile",
      ok: false,
    });
    expect(selectProfile(removed, "b")).toStrictEqual({
      error: "unknownProfile",
      ok: false,
    });
  });

  it("resizes a split of a group and refuses one it does not have", () => {
    const { ids, state } = start();
    const group = firstGroup(state, "a");
    const [pane] = panes(group?.layout ?? null);
    if (group === undefined || pane === undefined) {
      throw new Error("A fresh state has a group with a pane");
    }
    const split = unwrap(
      addTab(state, tabOf("t2", "a"), ids, {
        groupId: group.id,
        orientation: "vertical",
        paneId: pane.paneId,
      })
    );
    const layout = split.groups[0]?.layout;
    const splitId = layout?.kind === "split" ? layout.id : "";
    const resized = unwrap(resizeSplit(split, group.id, splitId, 0.3));
    expect(resized.groups[0]?.layout).toMatchObject({ ratio: 0.3 });
    expect(resizeSplit(split, group.id, "nope", 0.3)).toStrictEqual({
      error: "unknownSplit",
      ok: false,
    });
  });
});

describe(colorFor, () => {
  it("picks a colour of the palette, the same for the same id", () => {
    expect(PROFILE_COLORS).toContain(colorFor("profile-1"));
    expect(colorFor("profile-1")).toBe(colorFor("profile-1"));
  });
});

const repair = () => {
  const ids = fakeIds("r");
  return {
    fresh: () => freshState(profile("fresh"), tabOf("f1", "fresh"), ids),
    ids,
    tabFor: (profileId: string) => tabOf(`new-${profileId}`, profileId),
  };
};

describe(repairState, () => {
  it("starts fresh when no profile survives", () => {
    const repaired = repairState({ profiles: [{ id: "" }] }, repair());
    expect(repaired.state.profiles.map((found) => found.id)).toStrictEqual([
      "fresh",
    ]);
    expect(repaired.dropped).toStrictEqual(["every profile"]);
  });

  it("keeps what holds together and mends the rest", () => {
    const { state } = start();
    const data = {
      groups: [
        ...state.groups,
        { id: "bad", layout: leaf("px", "t1"), profileId: "a", tabIds: ["t1"] },
      ],
      profiles: [...state.profiles, profile("b", 1), { label: "no id" }],
      selectedProfileId: "gone",
      tabs: [...state.tabs, tabOf("t2", "a"), tabOf("t3", "nobody"), 7],
    };
    const repaired = repairState(data, repair());
    expect(validateState(repaired.state)).toStrictEqual([]);
    expect(repaired.state.selectedProfileId).toBe("a");
    expect(repaired.state.tabs.map((tab) => tab.id)).toStrictEqual([
      "t1",
      "t2",
      "new-b",
    ]);
    expect(repaired.dropped).toStrictEqual([
      "1 profiles",
      "1 tabs",
      "group bad",
    ]);
  });
});
