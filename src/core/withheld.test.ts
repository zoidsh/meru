import { describe, expect, it } from "vitest";

import { defaultCancelId } from "./withheld.ts";

describe(defaultCancelId, () => {
  it("answers the button labelled Cancel, as Electron does", () => {
    expect(defaultCancelId(["Remove", "Cancel"])).toBe(1);
  });

  it("answers the button labelled No, whatever its case", () => {
    expect(defaultCancelId(["Yes", "no"])).toBe(1);
  });

  it("answers the first button when none cancels", () => {
    expect(defaultCancelId(["Open", "Show"])).toBe(0);
  });

  it("answers the first when there are no buttons", () => {
    expect(defaultCancelId()).toBe(0);
  });
});
