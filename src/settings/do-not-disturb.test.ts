import { describe, expect, it } from "vitest";

import { doNotDisturbCaption } from "./do-not-disturb.ts";

describe(doNotDisturbCaption, () => {
  it("says what it does while off, and when it ends while on", () => {
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
      "Silences all notifications. You can also turn it on for a while from the moon in the title bar.",
      "On until you turn it off. Silences all notifications.",
      "On until tomorrow. Silences all notifications.",
      "On until 14:30. Silences all notifications.",
    ]);
  });
});
