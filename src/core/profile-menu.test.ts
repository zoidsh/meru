import { describe, expect, it } from "vitest";

import { profileMenuAt, profileMenuItems } from "./profile-menu.ts";
import { newProfile, sleepProfile } from "./state.ts";
import type { State } from "./state.ts";

const two: State = {
  version: 1,
  profiles: [newProfile("a", "Default"), newProfile("b", "Work")],
  selectedProfileId: "a",
};

describe(profileMenuItems, () => {
  it("offers Sleep for an awake profile, selected or not, Wake for one asleep, and nothing for one not listed", () => {
    const asleep = sleepProfile(two, "b") ?? two;

    expect([
      profileMenuItems(two, "a"),
      profileMenuItems(two, "b"),
      profileMenuItems(asleep, "b"),
      profileMenuItems(two, "missing"),
    ]).toStrictEqual([
      [{ id: "sleep", enabled: true }],
      [{ id: "sleep", enabled: true }],
      [{ id: "wake", enabled: true }],
      undefined,
    ]);
  });

  it("offers Sleep disabled for the last awake profile", () => {
    const asleep = sleepProfile(two, "b") ?? two;

    expect([
      profileMenuItems(asleep, "a"),
      profileMenuItems({ ...two, profiles: [newProfile("a", "Default")] }, "a"),
    ]).toStrictEqual([
      [{ id: "sleep", enabled: false }],
      [{ id: "sleep", enabled: false }],
    ]);
  });
});

describe(profileMenuAt, () => {
  const size = { width: 800, height: 600 };

  it("opens for any listed profile at a whole point of the content area", () => {
    expect(
      profileMenuAt(two, { profileId: "b", x: 120, y: 20 }, size)
    ).toStrictEqual({ profileId: "b", x: 120, y: 20 });
  });

  it("refuses a point outside the content area or not whole, and a profile not listed", () => {
    expect([
      profileMenuAt(two, { profileId: "b", x: 801, y: 20 }, size),
      profileMenuAt(two, { profileId: "b", x: -1, y: 20 }, size),
      profileMenuAt(two, { profileId: "b", x: 1.5, y: 20 }, size),
      profileMenuAt(two, { profileId: "missing", x: 1, y: 20 }, size),
    ]).toStrictEqual([undefined, undefined, undefined, undefined]);
  });
});
