import { describe, expect, it } from "vitest";

import { colorFor, PROFILE_COLORS } from "./profile.ts";

describe(colorFor, () => {
  it("picks a colour of the palette, the same for the same id", () => {
    expect(PROFILE_COLORS).toContain(colorFor("profile-1"));
    expect(colorFor("profile-1")).toBe(colorFor("profile-1"));
  });
});
