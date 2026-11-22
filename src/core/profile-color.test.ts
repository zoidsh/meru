import { describe, expect, it } from "vitest";

import {
  PROFILE_COLORS,
  firstUnusedColor,
  profileColor,
  profileColorName,
  withColorsStored,
} from "./profile-color.ts";
import { newProfile } from "./state.ts";
import type { Profile } from "./state.ts";

const profiles = Array.from({ length: 10 }, (_, index) =>
  newProfile(`p${index}`, `Profile ${index + 1}`)
);

const colored = (id: string, color: unknown): Profile => ({
  ...newProfile(id, id),
  color,
});

describe(profileColor, () => {
  it("gives each profile the palette's colour at its place, round again after the eighth", () => {
    expect(
      profiles.map((profile) => profileColor({ profiles }, profile.id))
    ).toStrictEqual([...PROFILE_COLORS, PROFILE_COLORS[0], PROFILE_COLORS[1]]);
  });

  it("gives a profile that is not listed the first colour", () => {
    expect(profileColor({ profiles }, "gone")).toBe(PROFILE_COLORS[0]);
  });

  it("reads a stored colour by name, and one it does not know as the colour at the profile's place", () => {
    const state = {
      profiles: [
        colored("a", "violet"),
        colored("b", "teal"),
        colored("c", 3),
        colored("d", "toString"),
      ],
    };

    expect(
      state.profiles.map((profile) => profileColorName(state, profile.id))
    ).toStrictEqual(["violet", "orange", "green", "pink"]);
  });
});

describe(firstUnusedColor, () => {
  it("takes the first colour no profile has, stored or by place", () => {
    expect(
      firstUnusedColor({
        profiles: [newProfile("a", "a"), colored("b", "green")],
      })
    ).toBe("orange");
  });

  it("goes by the new profile's place once every colour is taken", () => {
    expect(firstUnusedColor({ profiles: profiles.slice(0, 8) })).toBe("blue");
    expect(firstUnusedColor({ profiles: profiles.slice(0, 9) })).toBe("orange");
  });
});

describe(withColorsStored, () => {
  it("stores each colour that came from a place and keeps the ones stored", () => {
    expect(
      withColorsStored({
        profiles: [newProfile("a", "a"), colored("b", "lime")],
      }).map((profile) => profile.color)
    ).toStrictEqual(["blue", "lime"]);
  });

  it("leaves the profiles before `from` as they are", () => {
    expect(
      withColorsStored(
        { profiles: [newProfile("a", "a"), newProfile("b", "b")] },
        1
      ).map((profile) => profile.color)
    ).toStrictEqual([undefined, "orange"]);
  });

  it("leaves a stored colour it cannot read as found", () => {
    expect(
      withColorsStored({
        profiles: [
          { ...newProfile("a", "a"), color: "red" },
          { ...newProfile("b", "b"), color: 7 },
        ],
      }).map((profile) => profile.color)
    ).toStrictEqual(["red", 7]);
  });
});
