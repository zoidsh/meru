import { describe, expect, it } from "vitest";

import { doNotDisturbCaption } from "./do-not-disturb.ts";

describe(doNotDisturbCaption, () => {
  it("says what it holds while off, and when it ends while on", () => {
    expect([
      doNotDisturbCaption({ on: false, until: null }, "en-GB"),
      doNotDisturbCaption({ on: true, until: null }, "en-GB"),
      doNotDisturbCaption(
        { on: true, until: new Date(2026, 10, 22).getTime() },
        "en-GB"
      ),
      doNotDisturbCaption(
        { on: true, until: new Date(2026, 10, 21, 14, 30).getTime() },
        "en-GB"
      ),
    ]).toStrictEqual([
      "Holds every notification. The moon in the titlebar turns it on for a set time.",
      "On until you turn it off. Holds every notification.",
      "On until tomorrow. Holds every notification.",
      "On until 14:30. Holds every notification.",
    ]);
  });
});
