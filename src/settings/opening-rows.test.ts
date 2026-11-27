import { describe, expect, it } from "vitest";

import { dependentRow } from "./opening-rows.ts";

describe(dependentRow, () => {
  it("is usable while Open Google apps in Meru is on, asks to turn it on while off, and says Pro on the free version whatever the switch", () => {
    expect([
      dependentRow({ inMeru: true, needsPro: false }),
      dependentRow({ inMeru: false, needsPro: false }),
      dependentRow({ inMeru: true, needsPro: true }),
      dependentRow({ inMeru: false, needsPro: true }),
    ]).toStrictEqual([undefined, "turn-on-first", "pro", "pro"]);
  });
});
