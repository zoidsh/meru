import { describe, expect, test } from "bun:test";
import { getCSSFilterValue, getSVGFilterMatrixValue } from "./filter";
import { clamp, scale } from "./math";
import { ADJUSTED_THEME } from "./modify-colors.fixtures";
import { DEFAULT_THEME, type Theme } from "./theme";

const themeCases: Array<[string, Theme, string, string]> = [
  [
    "default",
    DEFAULT_THEME,
    "0.333 -0.667 -0.667 0.000 1.000 -0.667 0.333 -0.667 0.000 1.000 -0.667 -0.667 0.333 0.000 1.000 0.000 0.000 0.000 1.000 0.000",
    "invert(100%) hue-rotate(180deg)",
  ],
  [
    "brightness only",
    { ...DEFAULT_THEME, brightness: 110 },
    "0.366 -0.734 -0.734 0.000 1.100 -0.734 0.366 -0.734 0.000 1.100 -0.734 -0.734 0.366 0.000 1.100 0.000 0.000 0.000 1.000 0.000",
    "brightness(110%) invert(100%) hue-rotate(180deg)",
  ],
  [
    "contrast only",
    { ...DEFAULT_THEME, contrast: 105 },
    "0.350 -0.700 -0.700 0.000 1.025 -0.700 0.350 -0.700 0.000 1.025 -0.700 -0.700 0.350 0.000 1.025 0.000 0.000 0.000 1.000 0.000",
    "contrast(105%) invert(100%) hue-rotate(180deg)",
  ],
  [
    "sepia only",
    { ...DEFAULT_THEME, sepia: 10 },
    "0.249 -0.614 -0.672 0.000 1.035 -0.646 0.288 -0.664 0.000 1.020 -0.636 -0.609 0.250 0.000 0.994 0.000 0.000 0.000 1.000 0.000",
    "sepia(10%) invert(100%) hue-rotate(180deg)",
  ],
  [
    "grayscale only",
    { ...DEFAULT_THEME, grayscale: 5 },
    "0.294 -0.631 -0.663 0.000 1.000 -0.656 0.319 -0.663 0.000 1.000 -0.656 -0.631 0.287 0.000 1.000 0.000 0.000 0.000 1.000 0.000",
    "grayscale(5%) invert(100%) hue-rotate(180deg)",
  ],
  [
    "all adjustments",
    ADJUSTED_THEME,
    "0.246 -0.670 -0.772 0.000 1.170 -0.735 0.319 -0.763 0.000 1.153 -0.723 -0.666 0.241 0.000 1.123 0.000 0.000 0.000 1.000 0.000",
    "brightness(110%) contrast(105%) sepia(10%) grayscale(5%) invert(100%) hue-rotate(180deg)",
  ],
  [
    "all adjustments without inversion",
    { ...ADJUSTED_THEME, mode: 0 },
    "1.043 0.127 0.025 0.000 -0.026 0.051 1.105 0.023 0.000 -0.026 0.042 0.100 1.006 0.000 -0.025 0.000 0.000 0.000 1.000 0.000",
    "brightness(110%) contrast(105%) sepia(10%) grayscale(5%) invert(100%) hue-rotate(180deg)",
  ],
];

describe("getSVGFilterMatrixValue", () => {
  for (const [themeName, theme, expectedMatrix] of themeCases) {
    test(`exact matrix for the ${themeName} theme`, () => {
      expect(getSVGFilterMatrixValue(theme)).toBe(expectedMatrix);
    });
  }
});

describe("getCSSFilterValue", () => {
  for (const [themeName, theme, , expectedFilter] of themeCases) {
    test(`exact filter for the ${themeName} theme`, () => {
      expect(getCSSFilterValue(theme)).toBe(expectedFilter);
    });
  }
});

describe("scale", () => {
  test("linear interpolation between ranges", () => {
    expect(scale(5, 0, 10, 0, 1)).toBe(0.5);
    expect(scale(0, -1, 1, 10, 20)).toBe(15);
    expect(scale(0.75, 0.5, 1, 0.4, 1)).toBe(0.7);
    expect(scale(2, 0, 1, 0, 10)).toBe(20);
  });
});

describe("clamp", () => {
  test("bounds values to the range", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-2, 0, 3)).toBe(0);
    expect(clamp(1, 0, 3)).toBe(1);
  });
});
