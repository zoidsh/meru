import { describe, expect, it } from "vitest";

import { fakeIds } from "../../test/fakes/ids.ts";
import { random } from "../../test/random.ts";
import { unwrap } from "../../test/result.ts";
import type { Beside } from "../records/layout.ts";
import type { ProfilesState } from "../records/profiles-state.ts";
import type { Tab } from "../records/tab.ts";
import { leaf, panes } from "./layout.ts";
import { repairState } from "./state-repair.ts";
import { validateState } from "./state-validate.ts";
import {
  addProfile,
  addTab,
  equaliseGroup,
  canClose,
  closeTab,
  openTab,
  createGroup,
  firstGroup,
  freshState,
  leaveGroup,
  moveTabTo,
  newTab,
  pinSingleInstance,
  removeProfile,
  resizeSplit,
  selectProfile,
  joinTab,
  splitInto,
  swapPanes,
  updateProfile,
} from "./state.ts";

const VERTICAL_AFTER: Beside = { orientation: "vertical", side: "after" };

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

const gmail = (appId: string) => appId === "gmail";

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
  it("renames a profile and changes its colour, keeping what the patch leaves out", () => {
    const { state } = start();
    const [first] = state.profiles;
    const profileId = first?.id ?? "";
    const renamed = unwrap(
      updateProfile(state, profileId, { color: "#123456", label: "Work" })
    );
    const relabelled = unwrap(
      updateProfile(renamed, profileId, { label: "Home" })
    );
    expect({
      relabelled: relabelled.profiles[0],
      renamed: renamed.profiles[0],
      unknown: updateProfile(state, "nobody", { label: "Work" }),
    }).toStrictEqual({
      relabelled: { ...first, color: "#123456", label: "Home" },
      renamed: { ...first, color: "#123456", label: "Work" },
      unknown: { error: "unknownProfile", ok: false },
    });
  });

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
        side: "after",
        paneId: pane.paneId,
      })
    );
    expect(validateState(split)).toStrictEqual([]);
    expect(split.groups.map((found) => found.tabIds)).toStrictEqual([
      ["t1", "t2"],
    ]);
    const closed = unwrap(closeTab(split, "t2", gmail));
    expect(validateState(closed)).toStrictEqual([]);
    expect(closed.groups).toStrictEqual([group]);
    expect(closeTab(closed, "t1", () => false)).toStrictEqual({
      error: "lastTab",
      ok: false,
    });
  });

  it("keeps a profile's last tab of a single-instance app, and closes one that has another", () => {
    const { ids, state } = start();
    const two = unwrap(addTab(state, tabOf("t2", "a"), ids));
    const calendar = unwrap(
      addTab(state, { ...tabOf("t3", "a"), appId: "calendar" }, ids)
    );
    expect([
      closeTab(calendar, "t1", gmail),
      closeTab(two, "t1", gmail).ok,
      closeTab(calendar, "t3", gmail).ok,
    ]).toStrictEqual([{ error: "required", ok: false }, true, true]);
  });

  it("answers whether a tab may close without closing it", () => {
    const { ids, state } = start();
    const calendar = unwrap(
      addTab(state, { ...tabOf("t3", "a"), appId: "calendar" }, ids)
    );
    expect([
      canClose(calendar, "t1", gmail),
      canClose(calendar, "t3", gmail),
      canClose(state, "t1", () => false),
      canClose(state, "nope", gmail),
    ]).toStrictEqual([
      { error: "required", ok: false },
      { ok: true, value: undefined },
      { error: "lastTab", ok: false },
      { error: "unknownTab", ok: false },
    ]);
  });

  it("opens to a profile's one tab of a single-instance app, and adds a tab of any other", () => {
    const { ids, state } = start();
    const again = unwrap(openTab(state, tabOf("t2", "a"), ids, gmail));
    const calendar = { ...tabOf("t3", "a"), appId: "calendar" };
    const added = unwrap(openTab(state, calendar, ids, gmail));
    expect({
      again: [again.tab.id, again.state],
      added: [added.tab.id, added.state.tabs.map((tab) => tab.id)],
      other: unwrap(
        openTab(state, { ...tabOf("t4", "a"), appId: "drive" }, ids, gmail)
      ).tab.id,
    }).toStrictEqual({
      added: ["t3", ["t1", "t3"]],
      again: ["t1", state],
      other: "t4",
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
    const first = unwrap(leaveGroup(made.state, "t3", ids, 0));
    expect(first.tabs.map((tab) => tab.id)).toStrictEqual(["t3", "t1", "t2"]);
  });

  it("joins a tab beside another group's pane, out of its own group first, on the side asked", () => {
    const { ids, state } = start();
    const more = unwrap(
      addTab(
        unwrap(addTab(state, tabOf("t2", "a"), ids)),
        tabOf("t3", "a"),
        ids
      )
    );
    const grouped = unwrap(createGroup(more, ["t1", "t2"], "vertical", ids));
    const joined = unwrap(
      joinTab(
        grouped.state,
        "t2",
        "t3",
        { orientation: "horizontal", side: "before" },
        ids
      )
    );
    const [, group] = joined.groups;
    expect({
      groups: joined.groups.map((found) => found.tabIds),
      layout:
        group?.layout?.kind === "split"
          ? [
              group.layout.orientation,
              panes(group.layout).flatMap((pane) => pane.tabIds),
            ]
          : [],
      problems: validateState(joined),
    }).toStrictEqual({
      groups: [["t1"], ["t3", "t2"]],
      layout: ["horizontal", ["t2", "t3"]],
      problems: [],
    });
    expect(joinTab(joined, "t2", "t2", VERTICAL_AFTER, ids)).toStrictEqual({
      error: "alreadyGrouped",
      ok: false,
    });
    expect(joinTab(joined, "t2", "gone", VERTICAL_AFTER, ids)).toStrictEqual({
      error: "unknownTab",
      ok: false,
    });
  });

  it("moves a tab within its own group, keeping its pane, the group and every tab", () => {
    const { ids, state } = start();
    const more = unwrap(
      addTab(
        unwrap(addTab(state, tabOf("t2", "a"), ids)),
        tabOf("t3", "a"),
        ids
      )
    );
    const grouped = unwrap(
      createGroup(more, ["t1", "t2", "t3"], "vertical", ids)
    );
    const group = grouped.state.groups.find(
      (found) => found.id === grouped.groupId
    );
    const before = panes(group?.layout ?? null);
    const moved = unwrap(
      joinTab(
        grouped.state,
        "t3",
        "t1",
        { orientation: "horizontal", side: "before" },
        ids
      )
    );
    const after = panes(
      moved.groups.find((found) => found.id === grouped.groupId)?.layout ?? null
    );
    expect({
      groups: moved.groups.map((found) => found.tabIds),
      order: after.flatMap((pane) => pane.tabIds),
      panes: after.map((pane) => pane.paneId).toSorted(),
      problems: validateState(moved),
    }).toStrictEqual({
      groups: [["t1", "t2", "t3"]],
      order: ["t3", "t1", "t2"],
      panes: before.map((pane) => pane.paneId).toSorted(),
      problems: [],
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
        {
          groupId: first.id,
          orientation: "vertical",
          paneId: "n2",
          side: "after",
        },
        ids
      )
    ).toStrictEqual({ error: "otherProfile", ok: false });
    const three = unwrap(addTab(two, tabOf("t3", "a"), ids));
    expect(
      splitInto(
        three,
        "t3",
        {
          groupId: first.id,
          orientation: "vertical",
          paneId: "nope",
          side: "after",
        },
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
        side: "after",
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

const repair = () => {
  const ids = fakeIds("r");
  return {
    fresh: () => freshState(profile("fresh"), tabOf("f1", "fresh"), ids),
    ids,
    tabFor: (profileId: string) => tabOf(`new-${profileId}`, profileId),
  };
};

describe("the state's invariants under the layout's own changes", () => {
  it.each(Array.from({ length: 40 }, (_, index) => index + 1))(
    "hold through a run of moves, swaps, equalises and resizes of one group's panes (seed %i)",
    (seed) => {
      const draw = random(seed);
      const any = <T>(items: readonly T[]): T | undefined =>
        items[Math.floor(draw() * items.length)];
      const { ids, state } = start();
      let current = state;
      for (const tabId of ["t2", "t3", "t4", "t5"]) {
        current = unwrap(addTab(current, tabOf(tabId, "a"), ids));
      }
      const grouped = unwrap(
        createGroup(current, ["t1", "t2", "t3", "t4", "t5"], "vertical", ids)
      );
      const { groupId } = grouped;
      current = grouped.state;
      let changed = 0;
      for (let step = 0; step < 60; step += 1) {
        const before = current;
        const layout =
          before.groups.find((found) => found.id === groupId)?.layout ?? null;
        const a = any(panes(layout));
        const b = any(panes(layout));
        const beside: Beside = {
          orientation: draw() < 0.5 ? "vertical" : "horizontal",
          side: draw() < 0.5 ? "before" : "after",
        };
        const operation = any([
          () =>
            joinTab(
              before,
              a?.tabIds[0] ?? "",
              b?.tabIds[0] ?? "",
              beside,
              ids
            ),
          () => swapPanes(before, groupId, a?.paneId ?? "", b?.paneId ?? ""),
          () => equaliseGroup(before, groupId),
          () =>
            resizeSplit(
              before,
              groupId,
              layout?.kind === "split" ? layout.id : "",
              draw()
            ),
        ]);
        const result = operation?.();
        if (result?.ok === true) {
          current = result.value;
          changed += 1;
        }
        expect(validateState(current)).toStrictEqual([]);
      }
      expect(changed).toBeGreaterThan(20);
    }
  );

  it("refuses to swap in a group or with a pane it does not have", () => {
    const { state } = start();
    const [group] = state.groups;
    const [pane] = panes(group?.layout ?? null);
    expect([
      swapPanes(state, "g9", pane?.paneId ?? "", "p9"),
      swapPanes(state, group?.id ?? "", pane?.paneId ?? "", "p9"),
      equaliseGroup(state, "g9"),
    ]).toStrictEqual([
      { error: "unknownGroup", ok: false },
      { error: "unknownPane", ok: false },
      { error: "unknownGroup", ok: false },
    ]);
  });
});

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

const pinnedStart = () => {
  const ids = fakeIds("n");
  const state = freshState(
    profile("a"),
    { ...tabOf("t1", "a"), pinned: true },
    ids
  );
  const calendar = { ...tabOf("t2", "a"), appId: "calendar" };
  const drive = { ...tabOf("t3", "a"), appId: "drive" };
  const added = unwrap(
    addTab(unwrap(addTab(state, calendar, ids)), drive, ids)
  );
  return { ids, state: added };
};

describe("a pinned tab", () => {
  it("is what a new tab of a single-instance app is, and only that", () => {
    const ids = fakeIds("n");
    const app = {
      hosts: ["mail.google.com"],
      icon: "gmail" as const,
      id: "gmail",
      name: "Gmail",
      openBehavior: "tab" as const,
      url: "https://mail.google.com/",
    };
    expect([
      newTab(ids, "a", { ...app, singleInstance: true }).pinned,
      newTab(ids, "a", app).pinned,
    ]).toStrictEqual([true, false]);
  });

  it("neither moves nor leaves its group nor joins another, while the others may leave it", () => {
    const { ids, state } = pinnedStart();
    const joined = unwrap(joinTab(state, "t2", "t1", VERTICAL_AFTER, ids));
    expect([
      moveTabTo(state, "t1", 2),
      leaveGroup(joined, "t1", ids),
      joinTab(state, "t1", "t2", VERTICAL_AFTER, ids),
      leaveGroup(joined, "t2", ids).ok,
    ]).toStrictEqual([
      { error: "pinned", ok: false },
      { error: "pinned", ok: false },
      { error: "pinned", ok: false },
      true,
    ]);
  });

  it("keeps the first row when another row is moved to the top", () => {
    const { state } = pinnedStart();
    const moved = unwrap(moveTabTo(state, "t3", 0));
    expect(moved.tabs.map((tab) => tab.id)).toStrictEqual(["t1", "t3", "t2"]);
  });

  it("is set on the tabs of a single-instance app in a state written before the rule, leaving a state that has it as it is", () => {
    const { state } = start();
    const pinned = pinSingleInstance(state, gmail);
    expect([
      pinned.tabs.map((tab) => tab.pinned),
      pinSingleInstance(pinned, gmail),
    ]).toStrictEqual([[true], pinned]);
  });
});
