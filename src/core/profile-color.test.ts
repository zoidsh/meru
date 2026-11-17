import { describe, expect, it } from "vitest";

import { PROFILE_COLORS, profileColor } from "./profile-color.ts";
import { newProfile } from "./state.ts";

const profiles = Array.from({ length: 10 }, (_, index) =>
  newProfile(`p${index}`, `Profile ${index + 1}`)
);

describe(profileColor, () => {
  it("gives each profile the palette's colour at its place, round again after the eighth", () => {
    expect(
      profiles.map((profile) => profileColor({ profiles }, profile.id))
    ).toStrictEqual([...PROFILE_COLORS, PROFILE_COLORS[0], PROFILE_COLORS[1]]);
  });

  it("gives a profile that is not listed the first colour", () => {
    expect(profileColor({ profiles }, "gone")).toBe(PROFILE_COLORS[0]);
  });
});
