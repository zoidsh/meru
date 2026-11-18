import { describe, expect, it } from "vitest";

import { APPS, findApp } from "./apps.ts";
import {
  addProfile,
  adjacentProfile,
  canRemoveProfile,
  DEFAULT_PROFILE_NAME,
  PROFILE_NAME_MAX_LENGTH,
  createInitialState,
  decodeState,
  encodeState,
  forgetEndedDoNotDisturb,
  forgetProfilesToClear,
  gmailTab,
  hasTabbedInbox,
  inOwnWindow,
  isAsleep,
  isPinned,
  isTab,
  knownTabs,
  newProfile,
  nextProfileName,
  opensAtLaunch,
  ownWindowBounds,
  profilePartition,
  removeProfile,
  renameProfile,
  selectProfile,
  selectedProfile,
  setTabbedInbox,
  sleepProfile,
  canSleepProfile,
  sortProfilesToClear,
  switchDoNotDisturb,
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
  it("reads a file whose profiles hold no tabs key as each with a new profile's Gmail tab, pinned and selected", () => {
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
  it("keeps the tabs in the order stored, adds no Gmail tab, and reads an empty list as none, selected", () => {
    expect([
      decodeTabs([tab("t1", "calendar"), tab("gmail", "gmail")], "t1"),
      decodeTabs([tab("t1", "drive")]),
      decodeTabs([]),
    ]).toStrictEqual([
      { ids: ["t1", "gmail"], selected: "t1" },
      { ids: ["t1"], selected: "t1" },
      { ids: [], selected: "" },
    ]);
  });

  it("never selects a tab in its own window, selecting the first in the main window instead", () => {
    expect(
      decodeTabs(
        [{ ...tab("t1", "calendar"), ownWindow: true }, tab("t2", "drive")],
        "t1"
      )
    ).toStrictEqual({ ids: ["t1", "t2"], selected: "t2" });
  });

  it("reads a tab as in its own window only for true, and never a pinned one", () => {
    expect(
      [
        { ...tab("t1", "calendar"), ownWindow: true },
        { ...tab("t2", "calendar"), ownWindow: "yes" },
        { ...tab("t3", "calendar"), ownWindow: true, pinned: true },
      ].map(inOwnWindow)
    ).toStrictEqual([true, false, false]);
  });

  it("reads where a tab's own window was only from four finite numbers", () => {
    const bounds = { x: -20, y: 30, width: 800, height: 600 };

    expect(
      [
        bounds,
        { ...bounds, extra: 1 },
        { ...bounds, width: "800" },
        { ...bounds, height: Number.POSITIVE_INFINITY },
        { x: 1, y: 2, width: 3 },
        "a place",
        null,
      ].map((windowBounds) =>
        ownWindowBounds({ ...tab("t1", "calendar"), windowBounds })
      )
    ).toStrictEqual([
      bounds,
      bounds,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("reads a Gmail tab stored with no pinned key as pinned and opening at launch, and every other tab's keys as found", () => {
    const profile = decodeProfile([
      tab("gmail", "gmail"),
      { ...tab("t1", "calendar"), pinned: true, openAtLaunch: false },
      { ...tab("t2", "drive"), pinned: "yes" },
    ]);
    const unpinned = decodeProfile([
      { ...tab("gmail", "gmail"), pinned: false, openAtLaunch: true },
    ]);

    expect([knownTabs(profile), knownTabs(unpinned)]).toStrictEqual([
      [
        { ...tab("gmail", "gmail"), pinned: true, openAtLaunch: true },
        { ...tab("t1", "calendar"), pinned: true, openAtLaunch: false },
        { ...tab("t2", "drive"), pinned: "yes" },
      ],
      [{ ...tab("gmail", "gmail"), pinned: false, openAtLaunch: true }],
    ]);
    expect(
      knownTabs(profile).map((known) => [isPinned(known), opensAtLaunch(known)])
    ).toStrictEqual([
      [true, true],
      [true, false],
      [false, false],
    ]);
  });

  it("keeps the Gmail tab whose id is Gmail's when several claim to be Gmail", () => {
    const profile = decodeProfile([
      { ...tab("g2", "gmail"), url: "first" },
      { ...tab("gmail", "gmail"), url: "fixed", kept: true },
    ]);

    expect(knownTabs(profile)).toStrictEqual([
      {
        ...tab("gmail", "gmail"),
        url: "fixed",
        kept: true,
        pinned: true,
        openAtLaunch: true,
      },
    ]);
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

      expect(profile.tabs).toHaveLength(2);
      expect(knownTabs(profile).map((known) => known.id)).toStrictEqual(["t1"]);
      expect(profile.selectedTabId).toBe("t1");
    }
  });

  it("gives a profile whose tabs are not a list a new profile's Gmail tab", () => {
    for (const tabs of ["tabs", { gmail: {} }, 3]) {
      const profile = decodeProfile(tabs, "gmail");

      expect(knownTabs(profile)).toStrictEqual([gmailTab()]);
      expect(profile.selectedTabId).toBe("gmail");
    }
  });

  it("selects the first shown tab when the selected tab is not a string", () => {
    expect(decodeProfile([tab("t1", "drive")], 7).selectedTabId).toBe("t1");
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
              pinned: true,
              openAtLaunch: true,
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

/** The ids of the sleeping profiles, then the selected one. */
const sleepers = (state: State | undefined) =>
  state && [
    state.profiles
      .filter((profile) => isAsleep(state, profile))
      .map((profile) => profile.id),
    state.selectedProfileId,
  ];

/** `three` with the profiles given stored asleep, keys as a file has them. */
const storedAsleep = (ids: string[], selectedProfileId = "b"): State => ({
  ...three,
  profiles: three.profiles.map((profile) =>
    ids.includes(profile.id) ? { ...profile, asleep: true } : profile
  ),
  selectedProfileId,
});

describe(selectProfile, () => {
  it("selects a listed profile, and changes nothing for the selected one or another", () => {
    expect(selectProfile(three, "c")?.selectedProfileId).toBe("c");
    expect(selectProfile(three, "b")).toBeUndefined();
    expect(selectProfile(three, "missing")).toBeUndefined();
  });

  it("wakes the profile it selects, dropping its key", () => {
    const selected = selectProfile(storedAsleep(["a", "c"]), "c");

    expect([sleepers(selected), selected?.profiles[2]]).toStrictEqual([
      [["a"], "c"],
      newProfile("c", "Profile 3"),
    ]);
  });

  it("drops the key of a profile a file stored asleep while selected as another is selected, so it stays awake", () => {
    const selected = selectProfile(storedAsleep(["b"]), "a");

    expect([sleepers(selected), selected?.profiles[1]]).toStrictEqual([
      [[], "a"],
      newProfile("b", "Profile 2"),
    ]);
  });
});

describe(canSleepProfile, () => {
  it("lets an awake profile sleep while another stays awake, and never the last awake one", () => {
    const aAsleep = storedAsleep(["a"]);

    expect([
      canSleepProfile(three, "a"),
      canSleepProfile(three, "b"),
      canSleepProfile(aAsleep, "c"),
      canSleepProfile(sleepProfile(aAsleep, "c") ?? three, "b"),
      canSleepProfile(aAsleep, "a"),
      canSleepProfile(
        createInitialState(() => "only"),
        "only"
      ),
      canSleepProfile(three, "missing"),
    ]).toStrictEqual([true, true, true, false, false, false, false]);
  });
});

describe(sleepProfile, () => {
  it("puts a background profile to sleep, leaving the selection", () => {
    expect(sleepers(sleepProfile(three, "a"))).toStrictEqual([["a"], "b"]);
  });

  it("selects the first awake profile in the row when the selected one sleeps", () => {
    expect([
      sleepers(sleepProfile(three, "b")),
      sleepers(sleepProfile(storedAsleep(["a"]), "b")),
      sleepers(sleepProfile({ ...three, selectedProfileId: "c" }, "c")),
    ]).toStrictEqual([
      [["b"], "a"],
      [["a", "b"], "c"],
      [["c"], "a"],
    ]);
  });

  it("refuses the last awake profile, a profile asleep already and one not listed", () => {
    expect([
      sleepProfile(storedAsleep(["a", "c"]), "b"),
      sleepProfile(
        createInitialState(() => "only"),
        "only"
      ),
      sleepProfile(storedAsleep(["a"]), "a"),
      sleepProfile(three, "missing"),
    ]).toStrictEqual([undefined, undefined, undefined, undefined]);
  });
});

describe(isAsleep, () => {
  it("keeps a profile asleep through the file, and anything but true as found, read awake", () => {
    const stored = {
      version: 1,
      profiles: [
        { id: "a", name: "A", asleep: true },
        { id: "b", name: "B", asleep: "yes" },
        { id: "c", name: "C" },
      ],
      selectedProfileId: "c",
    };
    const decoded = decodeState(stored);

    if (decoded.kind !== "read") {
      throw new Error("The state did not decode");
    }

    expect(
      decoded.value.profiles.map((profile) => isAsleep(decoded.value, profile))
    ).toStrictEqual([true, false, false]);
    expect(
      (
        encodeState(decoded.value) as { profiles: Record<string, unknown>[] }
      ).profiles.map((profile) => profile.asleep)
    ).toStrictEqual([true, "yes", undefined]);
  });

  it("reads the selected profile awake when a file stores it asleep, every profile asleep included, and writes its key back as found", () => {
    const decoded = decodeState({
      version: 1,
      profiles: [
        { id: "a", name: "A", asleep: true },
        { id: "b", name: "B", asleep: true },
      ],
      selectedProfileId: "b",
    });

    if (decoded.kind !== "read") {
      throw new Error("The state did not decode");
    }

    expect([
      sleepers(decoded.value),
      (
        encodeState(decoded.value) as { profiles: Record<string, unknown>[] }
      ).profiles.map((profile) => profile.asleep),
    ]).toStrictEqual([
      [["a"], "b"],
      [true, true],
    ]);
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
  it("selects the first awake profile in place of a sleeping neighbour, and wakes the neighbour when none is awake", () => {
    const four: State = {
      ...three,
      profiles: [...three.profiles, newProfile("d", "Profile 4")],
    };
    const cAsleep = sleepProfile(four, "c") ?? four;
    const allButBAsleep = {
      ...four,
      profiles: four.profiles.map((profile) =>
        profile.id === "b" ? profile : { ...profile, asleep: true }
      ),
    };
    const lastAwake = removeProfile(allButBAsleep, "b");

    expect([
      sleepers(removeProfile(cAsleep, "b")),
      sleepers(lastAwake),
      lastAwake?.profiles[1],
    ]).toStrictEqual([
      [["c"], "a"],
      [["a", "d"], "c"],
      newProfile("c", "Profile 3"),
    ]);
  });

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

const names = (state: State | undefined) =>
  state?.profiles.map((profile) => profile.name);

describe(renameProfile, () => {
  it("stores the name trimmed and changes nothing else", () => {
    const renamed = renameProfile(three, "c", "  Work  ");

    expect(names(renamed)).toStrictEqual(["Default", "Profile 2", "Work"]);
    expect(renamed?.selectedProfileId).toBe("b");
  });

  it("refuses an empty name, one over the limit, the same name and a missing profile", () => {
    expect(renameProfile(three, "c", "   ")).toBeUndefined();
    expect(
      renameProfile(three, "c", "x".repeat(PROFILE_NAME_MAX_LENGTH + 1))
    ).toBeUndefined();
    expect(renameProfile(three, "c", " Profile 3 ")).toBeUndefined();
    expect(renameProfile(three, "z", "Work")).toBeUndefined();
    expect(
      names(renameProfile(three, "c", "x".repeat(PROFILE_NAME_MAX_LENGTH)))
    ).toHaveLength(3);
  });

  it("drops control characters and keeps the joiners an emoji sequence needs", () => {
    expect(names(renameProfile(three, "c", "\tWo\nrk\u0000\u007F "))?.[2]).toBe(
      "Work"
    );
    expect(names(renameProfile(three, "c", "\u0007\u001B"))).toBeUndefined();
    expect(names(renameProfile(three, "c", "Team 👩\u200D💻\uFE0F"))?.[2]).toBe(
      "Team 👩\u200D💻\uFE0F"
    );
  });

  it("allows a name another profile has, as v3 does", () => {
    expect(names(renameProfile(three, "c", "Profile 2"))).toStrictEqual([
      "Default",
      "Profile 2",
      "Profile 2",
    ]);
  });

  it("stores a renamed Default as typed, so it is no longer the name translated as shown", () => {
    const renamed = renameProfile(three, "a", "Standard");

    expect(names(renamed)?.[0]).toBe("Standard");
    expect(renamed?.profiles[0]?.name).not.toBe(DEFAULT_PROFILE_NAME);
  });

  it("leaves the next automatic name the lowest number free", () => {
    const renamed = renameProfile(three, "b", "Work") as State;

    expect(nextProfileName(renamed, name)).toBe("Profile 2");
    expect(
      nextProfileName(renameProfile(three, "a", "Profile 4") as State, name)
    ).toBe("Profile 5");
  });
});

const read = (value: unknown): State => {
  const decoded = decodeState(value);

  if (decoded.kind !== "read") {
    throw new Error(decoded.kind);
  }

  return decoded.value;
};

/** What the file holds for Do Not Disturb, after a decode and an encode. */
const written = (state: State) =>
  (encodeState(state) as Record<string, unknown>).doNotDisturb;

describe("Do Not Disturb in the state", () => {
  it("reads a file without it, as every older one is, as off, and writes none", () => {
    const state = read(valid);

    expect(state).not.toHaveProperty("doNotDisturb");
    expect(encodeState(state)).not.toHaveProperty("doNotDisturb");
  });

  it("reads one until a time, and one until turned off", () => {
    expect([
      read({ ...valid, doNotDisturb: { until: 1_800_000_000_000 } })
        .doNotDisturb,
      read({ ...valid, doNotDisturb: { until: null } }).doNotDisturb,
    ]).toStrictEqual([{ until: 1_800_000_000_000 }, { until: null }]);
  });

  it("keeps keys it does not know inside it, on and when switched again", () => {
    const state = read({
      ...valid,
      doNotDisturb: { until: null, reason: "focus" },
    });

    expect(written(state)).toStrictEqual({ until: null, reason: "focus" });
    expect(written(switchDoNotDisturb(state, 5000))).toStrictEqual({
      until: 5000,
      reason: "focus",
    });
  });

  it.each([
    ["a string", { until: "soon" }],
    ["missing its end", {}],
    ["an end no date holds", { until: 1e300 }],
    ["an end just past what a date holds", { until: 8.64e15 + 1 }],
    ["a start just before what a date holds", { until: -8.64e15 - 1 }],
    ["not an object", true],
    ["null", null],
  ])(
    "reads one that is %s as off, keeps the file readable, and writes it back as found",
    (_name, value) => {
      const state = read({ ...valid, doNotDisturb: value });

      expect(state).not.toHaveProperty("doNotDisturb");
      expect(state.profiles).toHaveLength(2);
      expect(written(state)).toStrictEqual(value);
    }
  );

  it("writes one that did not decode back only until it is next switched", () => {
    const state = read({ ...valid, doNotDisturb: { until: "soon" } });

    expect(written(switchDoNotDisturb(state, null))).toStrictEqual({
      until: null,
    });
    expect(
      encodeState(switchDoNotDisturb(state, undefined))
    ).not.toHaveProperty("doNotDisturb");
  });

  it("switches it on until a time, until turned off, and off", () => {
    const state = read(valid);
    const on = switchDoNotDisturb(state, 5000);

    expect([
      written(on),
      written(switchDoNotDisturb(on, null)),
      written(switchDoNotDisturb(on, undefined)),
    ]).toStrictEqual([{ until: 5000 }, { until: null }, undefined]);
  });

  it("keeps one that has ended as read, to be dropped by the next write rather than at once", () => {
    const state = read({ ...valid, doNotDisturb: { until: 1000 } });

    expect(state.doNotDisturb).toStrictEqual({ until: 1000 });
    expect(written(forgetEndedDoNotDisturb(state, 999))).toStrictEqual({
      until: 1000,
    });
    expect(written(forgetEndedDoNotDisturb(state, 1000))).toBeUndefined();
  });

  it("never drops one until turned off, nor one that did not decode, for having ended", () => {
    const untilOff = read({ ...valid, doNotDisturb: { until: null } });
    const asFound = read({ ...valid, doNotDisturb: { until: "soon" } });

    expect([
      written(forgetEndedDoNotDisturb(untilOff, Number.MAX_SAFE_INTEGER)),
      written(forgetEndedDoNotDisturb(asFound, Number.MAX_SAFE_INTEGER)),
    ]).toStrictEqual([{ until: null }, { until: "soon" }]);
  });

  it("reads the furthest ends a date holds", () => {
    expect([
      read({ ...valid, doNotDisturb: { until: 8.64e15 } }).doNotDisturb,
      read({ ...valid, doNotDisturb: { until: -8.64e15 } }).doNotDisturb,
    ]).toStrictEqual([{ until: 8.64e15 }, { until: -8.64e15 }]);
  });

  it("drops one JSON cannot write back as read, rather than turn it on with the next write", () => {
    // 1e999 reads as Infinity, which JSON writes as null: until turned off.
    const state = read(
      JSON.parse(
        `{"version": 1, "profiles": [{"id": "a", "name": "A"}], "doNotDisturb": {"until": 1e999}}`
      )
    );

    expect(state).not.toHaveProperty("doNotDisturb");
    expect(encodeState(state)).not.toHaveProperty("doNotDisturb");
    const file = JSON.stringify(encodeState(state));

    expect(read(JSON.parse(file))).not.toHaveProperty("doNotDisturb");
  });

  it("stays on version 1", () => {
    expect(encodeState(switchDoNotDisturb(read(valid), null))).toMatchObject({
      version: 1,
    });
  });
});

const firstWritten = (state: State) =>
  (encodeState(state) as { profiles: Record<string, unknown>[] }).profiles[0];

describe("a profile's tabbed inbox in the state", () => {
  const WORK = valid.profiles[0]?.id ?? "";

  it("reads a file without it, as every older one is, as not tabbed, and writes none", () => {
    const state = read(valid);

    expect(hasTabbedInbox(state, WORK)).toBeFalsy();
    expect(firstWritten(state)).not.toHaveProperty("tabbedInbox");
  });

  it("writes what the page said, either way", () => {
    const tabbed = setTabbedInbox(read(valid), WORK, true);
    const untabbed = tabbed && setTabbedInbox(tabbed, WORK, false);

    expect(tabbed && hasTabbedInbox(tabbed, WORK)).toBeTruthy();
    expect(tabbed && firstWritten(tabbed)).toMatchObject({ tabbedInbox: true });
    expect(untabbed && firstWritten(untabbed)).toMatchObject({
      tabbedInbox: false,
    });
  });

  it("writes nothing when it already reads so or there is no such profile", () => {
    const tabbed = setTabbedInbox(read(valid), WORK, true);

    expect(tabbed && setTabbedInbox(tabbed, WORK, true)).toBeUndefined();
    expect(setTabbedInbox(read(valid), WORK, false)).toBeUndefined();
    expect(setTabbedInbox(read(valid), "gone", true)).toBeUndefined();
  });

  it.each([
    ["a string", "yes"],
    ["a number", 1],
    ["an object", { tabbed: true }],
    ["null", null],
  ])(
    "reads one that is %s as not tabbed and writes it back as found, until the page says tabbed",
    (_name, value) => {
      const state = read({
        ...valid,
        profiles: [
          { ...valid.profiles[0], tabbedInbox: value },
          valid.profiles[1],
        ],
      });

      expect(hasTabbedInbox(state, WORK)).toBeFalsy();
      expect(firstWritten(state)).toMatchObject({ tabbedInbox: value });
      expect(setTabbedInbox(state, WORK, false)).toBeUndefined();

      const tabbed = setTabbedInbox(state, WORK, true);

      expect(tabbed && firstWritten(tabbed)).toMatchObject({
        tabbedInbox: true,
      });
    }
  );
});
