import { describe, expect, it } from "vitest";

import { tabsSleepByChoice } from "./migrations.ts";

describe(tabsSleepByChoice, () => {
  it("gives every tab `sleeps` off in place of `sleeping`, and leaves the rest", () => {
    expect([
      tabsSleepByChoice({
        groups: [],
        selectedProfileId: "p1",
        tabs: [
          { appId: "gmail", id: "t1", sleeping: true },
          { appId: "drive", id: "t2" },
          "not a tab",
        ],
      }),
      tabsSleepByChoice({ tabs: "not tabs" }),
      tabsSleepByChoice(null),
    ]).toStrictEqual([
      {
        groups: [],
        selectedProfileId: "p1",
        tabs: [
          { appId: "gmail", id: "t1", sleeps: false },
          { appId: "drive", id: "t2", sleeps: false },
          "not a tab",
        ],
      },
      { tabs: "not tabs" },
      null,
    ]);
  });
});
