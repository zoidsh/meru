import { describe, expect, it } from "vitest";

import { APPS, findApp } from "./apps.ts";
import {
  addProfile,
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
      kind: "state",
      state: {
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
      kind: "state",
      state: withUnknown,
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
      { ...valid, profiles: [] },
      { ...valid, profiles: [{ id: "", name: "Default" }] },
      { ...valid, profiles: [{ id: "a" }] },
      { ...valid, selectedProfileId: "missing" },
    ]) {
      const decoded = decodeState(value);

      expect(decoded.kind).toBe("unreadable");
      expect(decoded.kind === "unreadable" && decoded.reason).not.toBe("");
    }
  });
});

/** The profile whose tabs and selection a file names so, decoded. */
const decodeProfile = (tabs: unknown, selectedTabId?: unknown) => {
  const decoded = decodeState({
    ...valid,
    profiles: [{ ...valid.profiles[0], tabs, selectedTabId }],
    selectedProfileId: valid.profiles[0]?.id,
  });

  if (decoded.kind !== "state" || !decoded.state.profiles[0]) {
    throw new Error("The file did not decode");
  }

  return decoded.state.profiles[0];
};

/** The profile's tabs as a file names them, decoded. */
const decodeTabs = (tabs: unknown, selectedTabId?: string) => {
  const decoded = decodeState({
    ...valid,
    profiles: [{ ...valid.profiles[0], tabs, selectedTabId }],
    selectedProfileId: valid.profiles[0]?.id,
  });

  if (decoded.kind !== "state") {
    throw new Error(decoded.kind);
  }

  const [profile] = decoded.state.profiles;

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

  if (decoded.kind !== "state") {
    throw new Error(decoded.kind);
  }

  return encodeState(change(decoded.state)) as {
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
    expect(decodeState(state)).toStrictEqual({ kind: "state", state });
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

    expect(next && decodeState(next).kind).toBe("state");
  });
});
