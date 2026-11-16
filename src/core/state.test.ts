import { describe, expect, it } from "vitest";

import {
  addProfile,
  canRemoveProfile,
  createInitialState,
  decodeState,
  nextProfileName,
  profilePartition,
  removeProfile,
  selectProfile,
  selectedProfile,
} from "./state.ts";
import type { State } from "./state.ts";

const valid = {
  version: 1,
  profiles: [
    { id: "4d6f0c1e-0f7a-4d8e-9a4b-2f1c3e5d7a90", name: "Work" },
    { id: "b1c2d3e4-f5a6-4b7c-8d9e-0a1b2c3d4e5f", name: "Default" },
  ],
  selectedProfileId: "b1c2d3e4-f5a6-4b7c-8d9e-0a1b2c3d4e5f",
};

describe(decodeState, () => {
  it("reads a valid state", () => {
    expect(decodeState(valid)).toStrictEqual({ kind: "state", state: valid });
  });

  it("keeps keys it does not know, at the top and in a profile", () => {
    const withUnknown = {
      ...valid,
      panes: [],
      profiles: [{ ...valid.profiles[0], color: "teal" }, valid.profiles[1]],
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

describe(createInitialState, () => {
  it("creates one selected profile named as v3 names its first account", () => {
    const state = createInitialState(() => "f00d");

    expect(state).toStrictEqual({
      version: 1,
      profiles: [{ id: "f00d", name: "Default" }],
      selectedProfileId: "f00d",
    });
    expect(decodeState(state)).toStrictEqual({ kind: "state", state });
    expect(selectedProfile(state)).toStrictEqual({
      id: "f00d",
      name: "Default",
    });
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
    { id: "a", name: "Default" },
    { id: "b", name: "Profile 2" },
    { id: "c", name: "Profile 3" },
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
    expect(addProfile(three, { id: "d", name: "Profile 4" })).toStrictEqual({
      ...three,
      profiles: [...three.profiles, { id: "d", name: "Profile 4" }],
      selectedProfileId: "d",
    });
  });
});

describe(selectProfile, () => {
  it("selects a listed profile and refuses another", () => {
    expect(selectProfile(three, "c")?.selectedProfileId).toBe("c");
    expect(selectProfile(three, "missing")).toBeUndefined();
  });
});

/** The profile ids and the selected one, or nothing. */
const ids = (state: State | undefined) =>
  state && [
    state.profiles.map((profile) => profile.id),
    state.selectedProfileId,
  ];

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

    expect(canRemoveProfile(one)).toBeFalsy();
    expect(removeProfile(one, "a")).toBeUndefined();
    expect(canRemoveProfile(three)).toBeTruthy();
    expect(removeProfile(three, "missing")).toBeUndefined();
  });

  it("leaves a state that still decodes", () => {
    const next = removeProfile(three, "b");

    expect(next && decodeState(next).kind).toBe("state");
  });
});
