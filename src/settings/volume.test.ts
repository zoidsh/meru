import { describe, expect, it } from "vitest";

import type { ListedProfile } from "./scope.ts";
import { volumeSound } from "./volume.ts";

const profile = (
  id: string,
  overrides: ListedProfile["overrides"] = {}
): ListedProfile => ({
  id,
  name: id,
  color: "#2d52d2",
  colorName: "blue",
  enabled: true,
  asleep: false,
  checkMail: true,
  mail: { status: "unknown", address: null },
  savedSearches: [],
  overrides,
});

describe(volumeSound, () => {
  it("is the app's sound when it is one of Meru's, else the first profile's own of Meru's", () => {
    const profiles = [
      profile("home", { notificationSound: "system" }),
      profile("work", { notificationSound: "knock" }),
      profile("club", { notificationSound: "duet" }),
    ];

    expect([
      volumeSound("chime", profiles),
      volumeSound("none", profiles),
      volumeSound("system", profiles),
    ]).toStrictEqual(["chime", "knock", "knock"]);
  });

  it("is none while no sound the volume applies to is chosen anywhere", () => {
    expect([
      volumeSound("none", []),
      volumeSound("system", [
        profile("home"),
        profile("work", { notificationSound: "none" }),
      ]),
    ]).toStrictEqual([undefined, undefined]);
  });
});
