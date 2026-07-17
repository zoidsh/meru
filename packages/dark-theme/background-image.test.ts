import { describe, expect, test } from "bun:test";
import { modifyBackgroundImageValue } from "./background-image";
import { DEFAULT_THEME } from "./theme";

describe("modifyBackgroundImageValue", () => {
  test("darkens gradient stops synchronously without scheduling async work", () => {
    const modification = modifyBackgroundImageValue(
      "linear-gradient(rgb(255, 255, 255), rgb(0, 0, 0))",
      DEFAULT_THEME,
      () => false,
    );

    expect(modification.immediateValue).toBe("linear-gradient(#181a1b, #000000)");
    expect(modification.finalValuePromise).toBeNull();
  });

  test("splits layers at top-level commas only and keeps non-gradient layers as-is", () => {
    const modification = modifyBackgroundImageValue(
      "linear-gradient(to right, rgb(255, 255, 255) calc(10% + 5px), rgb(0, 0, 0)), repeating-conic-gradient(rgba(255, 0, 0, 0.25) 0deg, transparent 90deg), cross-fade(rgb(9, 9, 9), rgb(4, 5, 6), 50%)",
      DEFAULT_THEME,
      () => false,
    );

    expect(modification.immediateValue).toBe(
      "linear-gradient(to right, #181a1b calc(10% + 5px), #000000), repeating-conic-gradient(rgba(204, 0, 0, 0.25) 0deg, transparent 90deg), cross-fade(rgb(9, 9, 9), rgb(4, 5, 6), 50%)",
    );
    expect(modification.finalValuePromise).toBeNull();
  });

  test("recognizes a gradient after a unicode space boundary", () => {
    const modification = modifyBackgroundImageValue(
      "cross-fade(#fff)\u00a0linear-gradient(#fff, #000)",
      DEFAULT_THEME,
      () => false,
    );

    expect(modification.immediateValue).toBe(
      "cross-fade(#181a1b)\u00a0linear-gradient(#181a1b, #000000)",
    );
    expect(modification.finalValuePromise).toBeNull();
  });

  test("darkens a hex inside a gradient's var() fallback", () => {
    const modification = modifyBackgroundImageValue(
      "linear-gradient(var(--surface, #fff), #000)",
      DEFAULT_THEME,
      () => false,
    );

    expect(modification.immediateValue).toBe("linear-gradient(var(--surface, #181a1b), #000000)");
    expect(modification.finalValuePromise).toBeNull();
  });
});
