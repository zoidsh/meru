import { describe, expect, it } from "vitest";

import { doNotDisturbCaption } from "./do-not-disturb.ts";

const NOW = new Date(2026, 10, 21, 22).getTime();

describe(doNotDisturbCaption, () => {
  it("says what it does while off, and when it ends while on, naming tomorrow for an end after midnight", () => {
    expect([
      doNotDisturbCaption({ on: false, until: null }, "en-GB", NOW),
      doNotDisturbCaption({ on: true, until: null }, "en-GB", NOW),
      doNotDisturbCaption(
        { on: true, until: new Date(2026, 10, 22, 8).getTime() },
        "en-GB",
        NOW
      ),
      doNotDisturbCaption(
        { on: true, until: new Date(2026, 10, 21, 23, 30).getTime() },
        "en-GB",
        NOW
      ),
      doNotDisturbCaption(
        { on: true, until: new Date(2026, 10, 22, 8).getTime() },
        "en-GB",
        new Date(2026, 10, 22, 1).getTime()
      ),
    ]).toStrictEqual([
      "Silences all notifications. You can also turn it on for a while from the moon in the title bar.",
      "On until you turn it off. Silences all notifications.",
      "On until tomorrow, 8:00. Silences all notifications.",
      "On until 23:30. Silences all notifications.",
      "On until 8:00. Silences all notifications.",
    ]);
  });
});
