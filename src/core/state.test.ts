import { describe, expect, it } from "vitest";

import { APPS, findApp } from "./apps.ts";
import {
  addProfile,
  adjacentProfile,
  canRemoveProfile,
  createInitialState,
  decodeState,
  encodeState,
  forgetProfilesToClear,
  gmailTab,
  isTab,
  knownTabs,
  newProfile,
  nextProfileName,
  profilePartition,
  removeProfile,
  selectProfile,
  selectedProfile,
  sortProfilesToClear,
  withAProfile,
} from "./state.ts";
import type { State } from "./state.ts";
import { openTab } from "./tabs.ts";

const valid = {
  version: 1,
  profiles: [
    { id: "4d6f0c1e-0f7a-4d8e-9a4b-2f1c3e5d7a90", name: "Work" },
    { id: "b1c2d3e4-f5a6-4b7c-8d9e-0a1b2c3d4e5f", name: "Default" },
  ],
  selectedProfileId: "b1c2d3e4-f5a6-4b7c-8d9e-0a1b2c3d4e5f",
};

describe(decodeState, () => {
  it("reads a file slice 1.2 wrote, each profile with only its Gmail tab, selected", () => {
    expect(decodeState(valid)).toStrictEqual({
      kind: "read",
      value: {
        ...valid,
        profiles: valid.profiles.map((profile) => ({
          ...profile,
          tabs: [gmailTab()],
          selectedTabId: "gmail",
        })),
      },
    });
  });

  it("keeps keys it does not know, at the top, in a profile and in a tab", () => {
    const calendar = {
      id: "t1",
      app: "calendar",
      url: "https://calendar.google.com/",
      title: "Calendar",
      zoom: 1.5,
    };
    const withUnknown = {
      ...valid,
      panes: [],
      profiles: [
        {
          ...valid.profiles[0],
          color: "teal",
          tabs: [gmailTab(), calendar],
          selectedTabId: "t1",
        },
        { ...valid.profiles[1], tabs: [gmailTab()], selectedTabId: "gmail" },
      ],
    };

    expect(decodeState(withUnknown)).toStrictEqual({
      kind: "read",
      value: withUnknown,
    });
  });

  it("leaves a newer version to the Meru that wrote it", () => {
    expect(decodeState({ ...valid, version: 2 })).toStrictEqual({
      kind: "newer",
      version: 2,
    });
    expect(
      decodeState({ version: 7, profiles: "a later shape" })
    ).toStrictEqual({ kind: "newer", version: 7 });
  });

  it("cannot read a version no Meru wrote", () => {
    for (const version of [0, -1, 1.5, "1", null]) {
      expect(decodeState({ ...valid, version }).kind).toBe("unreadable");
    }
  });

  it("cannot read garbage or a broken shape, and says why", () => {
    for (const value of [
      undefined,
      null,
      "state",
      42,
      [],
      {},
      { ...valid, profiles: "profiles" },
      { ...valid, profiles: { a: {} } },
      { ...valid, version: 0 },
    ]) {
      const decoded = decodeState(value);

      expect(decoded.kind).toBe("unreadable");
      expect(decoded.kind === "unreadable" && decoded.reason).not.toBe("");
    }
  });
});

/** The state a file holding `profiles`, selecting `selected`, decodes to. */
const decodeProfiles = (profiles: unknown[], selected: unknown) => {
  const decoded = decodeState({
    ...valid,
    profiles,
    selectedProfileId: selected,
  });

  if (decoded.kind !== "read") {
    throw new Error(decoded.kind);
  }

  return decoded.value;
};

describe("decoding the top level", () => {
  it.each([
    ["selectedProfileId", 7],
    ["selectedProfileId", null],
    ["profilesToClear", "a"],
    ["profilesToClear", [7, "", "gone"]],
    ["profilesToClear", null],
    ["panes", 5],
  ])("reads a file whose %s is %j", (key, value) => {
    expect(decodeState({ ...valid, [key]: value }).kind).toBe("read");
  });

  it("clears only the ids on the list, and writes the rest back as found", () => {
    const decoded = decodeState({
      ...valid,
      profilesToClear: [7, "gone", ""],
    });

    if (decoded.kind !== "read") {
      throw new Error(decoded.kind);
    }

    expect(sortProfilesToClear(decoded.value).clear).toStrictEqual(["gone"]);
    expect(encodeState(decoded.value)).toMatchObject({
      profilesToClear: ["gone", 7, ""],
    });
  });

  it("writes a list to clear that is not a list back as found, until an id goes on it", () => {
    const decoded = decodeState({ ...valid, profilesToClear: "x" });

    if (decoded.kind !== "read") {
      throw new Error(decoded.kind);
    }

    expect(encodeState(decoded.value)).toMatchObject({ profilesToClear: "x" });

    const id = valid.profiles[0]?.id ?? "";
    const removed = removeProfile(decoded.value, id);

    expect(removed && encodeState(removed)).toMatchObject({
      profilesToClear: [id],
    });
  });
});

describe("decoding profiles", () => {
  const work = { id: "w", name: "Work" };
  const home = { id: "h", name: "Home" };

  it.each([
    { id: "", name: "Blank" },
    { id: "x" },
    { id: "x", name: 7 },
    "profile",
    null,
  ])("keeps %j, which does not parse, unshown and unselectable", (entry) => {
    const state = decodeProfiles([work, entry, home], "x");

    expect(state.profiles.map((profile) => profile.id)).toStrictEqual([
      "w",
      "h",
    ]);
    expect(state.selectedProfileId).toBe("w");
  });

  it("selects the first readable profile when the selection names a missing one or is not a string", () => {
    expect(decodeProfiles([work, home], "gone").selectedProfileId).toBe("w");
    expect(decodeProfiles([work, home], 3).selectedProfileId).toBe("w");
    expect(decodeProfiles([work, home], "h").selectedProfileId).toBe("h");
  });

  it("reads a file none of whose profiles parse as having none", () => {
    const state = decodeProfiles([{ id: "x" }], "x");

    expect(state.profiles).toStrictEqual([]);
    expect(withAProfile(state, () => "new").profiles).toStrictEqual([
      newProfile("new", "Default"),
    ]);
    expect(withAProfile(state, () => "new").selectedProfileId).toBe("new");
  });

  it("counts only readable profiles when one may be removed", () => {
    const state = decodeProfiles([work, { id: "x" }], "w");

    expect(canRemoveProfile(state, "w")).toBeFalsy();
    expect(canRemoveProfile(state, "x")).toBeFalsy();
  });

  it("never clears a listed profile's data, readable or not", () => {
    const decoded = decodeState({
      ...valid,
      profiles: [work, { id: "x" }],
      selectedProfileId: "w",
      profilesToClear: ["x", "w", "gone"],
    });

    if (decoded.kind !== "read") {
      throw new Error(decoded.kind);
    }

    expect(sortProfilesToClear(decoded.value)).toStrictEqual({
      clear: ["gone"],
      stillListed: ["x", "w"],
    });
  });

  it("writes each profile that did not parse back in its place, and a new one after it", () => {
    const broken = { id: "x", name: 7, color: "teal" };
    const state = decodeProfiles([work, broken, home, "last"], "w");

    expect(
      (encodeState(state) as { profiles: unknown[] }).profiles
    ).toStrictEqual([
      newProfile("w", "Work"),
      broken,
      newProfile("h", "Home"),
      "last",
    ]);

    const fresh = withAProfile(decodeProfiles([broken], "x"), () => "new");

    expect(
      (encodeState(fresh) as { profiles: unknown[] }).profiles
    ).toStrictEqual([broken, newProfile("new", "Default")]);
  });
});

/** The profile whose tabs and selection a file names so, decoded. */
const decodeProfile = (tabs: unknown, selectedTabId?: unknown) => {
  const decoded = decodeState({
    ...valid,
    profiles: [{ ...valid.profiles[0], tabs, selectedTabId }],
    selectedProfileId: valid.profiles[0]?.id,
  });

  if (decoded.kind !== "read" || !decoded.value.profiles[0]) {
    throw new Error("The file did not decode");
  }

  return decoded.value.profiles[0];
};

/** The profile's tabs as a file names them, decoded. */
const decodeTabs = (tabs: unknown, selectedTabId?: string) => {
  const decoded = decodeState({
    ...valid,
    profiles: [{ ...valid.profiles[0], tabs, selectedTabId }],
    selectedProfileId: valid.profiles[0]?.id,
  });

  if (decoded.kind !== "read") {
    throw new Error(decoded.kind);
  }

  const [profile] = decoded.value.profiles;

  return {
    ids: profile?.tabs.filter(isTab).map((tab) => tab.id),
    selected: profile?.selectedTabId,
  };
};

const tab = (id: string, app: string) => ({ id, app, url: "", title: "" });

describe("decoding tabs", () => {
  it("puts the Gmail tab first, or adds it when there is none", () => {
    expect(
      decodeTabs([tab("t1", "calendar"), tab("gmail", "gmail")], "t1")
    ).toStrictEqual({ ids: ["gmail", "t1"], selected: "t1" });
    expect(decodeTabs([tab("t1", "drive")])).toStrictEqual({
      ids: ["gmail", "t1"],
      selected: "gmail",
    });
    expect(decodeTabs([])).toStrictEqual({ ids: ["gmail"], selected: "gmail" });
  });

  it("keeps the Gmail tab whose id is Gmail's when several claim to be Gmail", () => {
    const profile = decodeProfile([
      { ...tab("g2", "gmail"), url: "first" },
      { ...tab("gmail", "gmail"), url: "fixed", kept: true },
    ]);

    expect(profile.tabs[0]).toStrictEqual({
      ...tab("gmail", "gmail"),
      url: "fixed",
      kept: true,
    });
  });

  it("keeps one Gmail tab and one tab of each id, the first", () => {
    expect(
      decodeTabs([
        tab("gmail", "gmail"),
        tab("t1", "calendar"),
        tab("g2", "gmail"),
        tab("t1", "drive"),
      ])
    ).toStrictEqual({ ids: ["gmail", "t1"], selected: "gmail" });
  });

  it("selects Gmail when the selected tab is missing or of an app this build does not know", () => {
    expect(decodeTabs([tab("gmail", "gmail")], "gone").selected).toBe("gmail");
    expect(
      decodeTabs([tab("gmail", "gmail"), tab("t9", "tasks")], "t9")
    ).toStrictEqual({ ids: ["gmail", "t9"], selected: "gmail" });
  });

  it("keeps a tab of an app this build does not know, but does not show it", () => {
    const profile = {
      ...newProfile("a", "Default"),
      tabs: [gmailTab(), tab("t9", "tasks"), tab("t1", "meet")],
    };

    expect(knownTabs(profile).map((known) => known.id)).toStrictEqual([
      "gmail",
      "t1",
    ]);
  });

  it("keeps an entry that does not parse where it was, unshown, and the profile readable", () => {
    for (const entry of [
      { id: "t2", app: "drive", url: "" },
      { id: "t2", app: "drive", url: null, title: "" },
      { id: "", app: "drive", url: "", title: "" },
      "t2",
      null,
    ]) {
      const profile = decodeProfile([tab("t1", "calendar"), entry], "t1");

      expect(profile.tabs).toHaveLength(3);
      expect(knownTabs(profile).map((known) => known.id)).toStrictEqual([
        "gmail",
        "t1",
      ]);
      expect(profile.selectedTabId).toBe("t1");
    }
  });

  it("gives a profile whose tabs are not a list its Gmail tab", () => {
    for (const tabs of ["tabs", { gmail: {} }, 3]) {
      const profile = decodeProfile(tabs, "gmail");

      expect(knownTabs(profile)).toStrictEqual([gmailTab()]);
      expect(profile.selectedTabId).toBe("gmail");
    }
  });

  it("selects Gmail when the selected tab is not a string", () => {
    expect(decodeProfile([tab("t1", "drive")], 7).selectedTabId).toBe("gmail");
  });
});

const fileWith = (tabs: unknown) => ({
  ...valid,
  profiles: [{ ...valid.profiles[0], tabs, selectedTabId: "gmail" }],
  selectedProfileId: valid.profiles[0]?.id,
});

/** The file as written after decoding it and making the change. */
const rewrite = (file: unknown, change: (state: State) => State) => {
  const decoded = decodeState(file);

  if (decoded.kind !== "read") {
    throw new Error(decoded.kind);
  }

  return encodeState(change(decoded.value)) as {
    profiles: { tabs: unknown }[];
  };
};

describe(encodeState, () => {
  it("writes each entry that did not parse back in its place among the tabs", () => {
    const broken = { id: "t2", app: "drive", url: null, title: "" };
    const drive = findApp(APPS, "drive");

    if (!drive) {
      throw new Error("no Drive");
    }

    const written = rewrite(
      fileWith([gmailTab(), broken, tab("t1", "calendar"), "t3"]),
      (state) =>
        openTab(
          state,
          valid.profiles[0]?.id ?? "",
          drive,
          drive.home,
          () => "t4"
        )?.state ?? state
    );

    expect(written.profiles[0]?.tabs).toStrictEqual([
      gmailTab(),
      broken,
      tab("t1", "calendar"),
      "t3",
      { id: "t4", app: "drive", url: drive.home, title: "" },
    ]);
  });

  it("writes a tabs that is not a list back as it was found", () => {
    const written = rewrite(fileWith("tabs"), (state) => state);

    expect(written.profiles[0]?.tabs).toBe("tabs");
  });
});

describe(createInitialState, () => {
  it("creates one selected profile named as v3 names its first account", () => {
    const state = createInitialState(() => "f00d");

    expect(state).toStrictEqual({
      version: 1,
      profiles: [
        {
          id: "f00d",
          name: "Default",
          tabs: [
            {
              id: "gmail",
              app: "gmail",
              url: "https://mail.google.com/mail/u/0",
              title: "",
            },
          ],
          selectedTabId: "gmail",
        },
      ],
      selectedProfileId: "f00d",
    });
    expect(decodeState(state)).toStrictEqual({ kind: "read", value: state });
    expect(selectedProfile(state).id).toBe("f00d");
  });
});

describe(profilePartition, () => {
  it("names a profile's session as v3 names its account's", () => {
    expect(profilePartition("f00d")).toBe("persist:f00d");
  });
});

const three: State = {
  version: 1,
  profiles: [
    newProfile("a", "Default"),
    newProfile("b", "Profile 2"),
    newProfile("c", "Profile 3"),
  ],
  selectedProfileId: "b",
};

const name = (n: number) => `Profile ${n}`;

describe(nextProfileName, () => {
  it("counts from 2 and takes the lowest number no profile's name uses", () => {
    expect(
      nextProfileName(
        createInitialState(() => "a"),
        name
      )
    ).toBe("Profile 2");
    expect(nextProfileName(three, name)).toBe("Profile 4");
    expect(
      nextProfileName(
        { ...three, profiles: [three.profiles[0], three.profiles[2]] } as State,
        name
      )
    ).toBe("Profile 2");
  });
});

describe(addProfile, () => {
  it("appends the profile and selects it", () => {
    expect(addProfile(three, newProfile("d", "Profile 4"))).toStrictEqual({
      ...three,
      profiles: [...three.profiles, newProfile("d", "Profile 4")],
      selectedProfileId: "d",
    });
  });
});

describe(selectProfile, () => {
  it("selects a listed profile, and changes nothing for the selected one or another", () => {
    expect(selectProfile(three, "c")?.selectedProfileId).toBe("c");
    expect(selectProfile(three, "b")).toBeUndefined();
    expect(selectProfile(three, "missing")).toBeUndefined();
  });
});

/** The profile ids and the selected one, or nothing. */
const ids = (state: State | undefined) =>
  state && [
    state.profiles.map((profile) => profile.id),
    state.selectedProfileId,
  ];

describe(sortProfilesToClear, () => {
  it("never offers to clear an id that is still listed as a profile", () => {
    expect(
      sortProfilesToClear({ ...three, profilesToClear: ["x", "b"] })
    ).toStrictEqual({ clear: ["x"], stillListed: ["b"] });
  });
});

describe(forgetProfilesToClear, () => {
  it("takes ids off the list, and changes nothing for none", () => {
    expect(
      forgetProfilesToClear({ ...three, profilesToClear: ["x", "y"] }, ["x"])
        ?.profilesToClear
    ).toStrictEqual(["y"]);
    expect(forgetProfilesToClear(three, [])).toBeUndefined();
  });
});

describe(removeProfile, () => {
  it("leaves the selection alone when another profile goes", () => {
    expect(ids(removeProfile(three, "a"))).toStrictEqual([["b", "c"], "b"]);
    expect(ids(removeProfile(three, "c"))).toStrictEqual([["a", "b"], "b"]);
  });

  it("selects the profile to the right of the selected one it removes", () => {
    expect(ids(removeProfile(three, "b"))).toStrictEqual([["a", "c"], "c"]);
  });

  it("selects the one to the left when the selected one was last", () => {
    expect(
      ids(removeProfile({ ...three, selectedProfileId: "c" }, "c"))
    ).toStrictEqual([["a", "b"], "b"]);
  });

  it("never removes the last profile, nor one that is not listed", () => {
    const one = createInitialState(() => "a");

    expect(canRemoveProfile(one, "a")).toBeFalsy();
    expect(removeProfile(one, "a")).toBeUndefined();
    expect(canRemoveProfile(three, "a")).toBeTruthy();
    expect(removeProfile(three, "missing")).toBeUndefined();
  });

  it("puts the removed profile on the list to clear, once", () => {
    expect(
      removeProfile({ ...three, profilesToClear: ["x", "c"] }, "c")
        ?.profilesToClear
    ).toStrictEqual(["x", "c"]);
    expect(removeProfile(three, "a")?.profilesToClear).toStrictEqual(["a"]);
  });

  it("removes every entry of an id a hand-edited file lists twice, and never the only id left", () => {
    const twice: State = {
      ...three,
      profiles: [
        newProfile("a", "Default"),
        newProfile("b", "Profile 2"),
        newProfile("a", "Again"),
      ],
      selectedProfileId: "a",
    };

    expect(ids(removeProfile(twice, "a"))).toStrictEqual([["b"], "b"]);
    expect(
      removeProfile(
        { ...twice, profiles: [twice.profiles[0], twice.profiles[2]] } as State,
        "a"
      )
    ).toBeUndefined();
  });

  it("leaves a state that still decodes", () => {
    const next = removeProfile(three, "b");

    expect(next && decodeState(next).kind).toBe("read");
  });
});

const abc = (selectedProfileId: string): State => ({
  version: 1,
  profiles: ["a", "b", "c"].map((id) => newProfile(id, id)),
  selectedProfileId,
});

describe(adjacentProfile, () => {
  it("is the next or previous profile, wrapping round", () => {
    expect(adjacentProfile(abc("a"), 1)).toBe("b");
    expect(adjacentProfile(abc("c"), 1)).toBe("a");
    expect(adjacentProfile(abc("a"), -1)).toBe("c");
    expect(adjacentProfile(abc("b"), -1)).toBe("a");
  });

  it("is nothing when there is only the one", () => {
    expect(
      adjacentProfile(
        createInitialState(() => "only"),
        1
      )
    ).toBeUndefined();
  });
});
