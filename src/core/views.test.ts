import { describe, expect, it } from "vitest";

import { planViews } from "./views.ts";

const profiles = [{ id: "a" }, { id: "b" }, { id: "c" }].map((profile) => ({
  ...profile,
  name: profile.id,
}));

describe(planViews, () => {
  it("gives only the selected profile a view at first", () => {
    expect(planViews({ profiles, selectedProfileId: "b" }, [])).toStrictEqual({
      profileIds: ["b"],
      visibleProfileId: "b",
    });
  });

  it("keeps a view that is no longer selected, and shows the selected one", () => {
    expect(
      planViews({ profiles, selectedProfileId: "c" }, ["b"])
    ).toStrictEqual({ profileIds: ["b", "c"], visibleProfileId: "c" });
  });

  it("drops the view of a profile that was removed", () => {
    expect(
      planViews({ profiles: profiles.slice(1), selectedProfileId: "c" }, [
        "a",
        "c",
      ])
    ).toStrictEqual({ profileIds: ["c"], visibleProfileId: "c" });
  });
});
