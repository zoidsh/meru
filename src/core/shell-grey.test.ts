import { describe, expect, it } from "vitest";

import { toHex, windowBackground } from "./shell-grey.ts";

describe(windowBackground, () => {
  it("is the shell grey of the theme, as Electron reads a colour", () => {
    expect([windowBackground(false), windowBackground(true)]).toStrictEqual([
      "#ebebeb",
      "#1d1d1d",
    ]);
  });
});

describe(toHex, () => {
  it("turns an oklch colour into the sRGB one it names", () => {
    expect(toHex("oklch(0.627955 0.257683 29.2339)")).toBe("#ff0000");
    expect(toHex("oklch(1 0 0)")).toBe("#ffffff");
    expect(toHex("oklch(0 0 0)")).toBe("#000000");
  });
});
