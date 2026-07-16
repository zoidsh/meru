import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import type { RGBA } from "./color";
import {
  clearColorModificationCache,
  modifyBackgroundColor,
  modifyBorderColor,
  modifyForegroundColor,
} from "./modify-colors";
import { LATTICE_EXPECTED, RANDOM_DIGESTS } from "./modify-colors.expected";
import { ADJUSTED_THEME, buildRandomColors } from "./modify-colors.fixtures";
import { DEFAULT_THEME, type Theme } from "./theme";

type FixtureRow = {
  color: RGBA;
  background: string;
  foreground: string;
  border: string;
};

function parseFixtureRows(fixtureText: string): FixtureRow[] {
  return fixtureText.split("\n").map((row) => {
    const [colorText = "", background = "", foreground = "", border = ""] = row.split("|");
    const [red = "", green = "", blue = "", alphaText = ""] = colorText.split(",");
    const color: RGBA = { r: Number(red), g: Number(green), b: Number(blue) };

    if (alphaText !== "u") {
      color.a = Number(alphaText);
    }

    return { color, background, foreground, border };
  });
}

function describeColor(color: RGBA) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
}

describe("lattice fixtures", () => {
  const latticeCases: Array<[string, Theme, string]> = [
    ["default theme", DEFAULT_THEME, LATTICE_EXPECTED.defaultTheme],
    ["adjusted theme", ADJUSTED_THEME, LATTICE_EXPECTED.adjustedTheme],
  ];

  for (const [themeName, theme, fixtureText] of latticeCases) {
    test(`exact outputs under the ${themeName}`, () => {
      for (const { color, background, foreground, border } of parseFixtureRows(fixtureText)) {
        expect(modifyBackgroundColor(color, theme), `background of ${describeColor(color)}`).toBe(
          background,
        );
        expect(modifyForegroundColor(color, theme), `foreground of ${describeColor(color)}`).toBe(
          foreground,
        );
        expect(modifyBorderColor(color, theme), `border of ${describeColor(color)}`).toBe(border);
      }
    });
  }
});

describe("bulk digest over 50000 deterministic random colors", () => {
  const digestCases: Array<[string, Theme, string]> = [
    ["default theme", DEFAULT_THEME, RANDOM_DIGESTS.defaultTheme],
    ["adjusted theme", ADJUSTED_THEME, RANDOM_DIGESTS.adjustedTheme],
  ];

  for (const [themeName, theme, expectedDigest] of digestCases) {
    test(`digest under the ${themeName}`, () => {
      const hash = createHash("sha256");

      for (const color of buildRandomColors(50000)) {
        hash.update(modifyBackgroundColor(color, theme));
        hash.update(modifyForegroundColor(color, theme));
        hash.update(modifyBorderColor(color, theme));
      }

      expect(hash.digest("hex")).toBe(expectedDigest);
    });
  }
});

describe("cache semantics", () => {
  test("repeated calls return identical output", () => {
    const color: RGBA = { r: 250, g: 240, b: 230, a: 1 };

    expect(modifyBackgroundColor(color, DEFAULT_THEME)).toBe(
      modifyBackgroundColor(color, DEFAULT_THEME),
    );
  });

  test("output is identical after clearing the cache", () => {
    const color: RGBA = { r: 66, g: 133, b: 244, a: 0.75 };
    const beforeClear = modifyForegroundColor(color, DEFAULT_THEME);

    clearColorModificationCache();

    expect(modifyForegroundColor(color, DEFAULT_THEME)).toBe(beforeClear);
  });

  test("value-equal theme objects produce identical output", () => {
    const color: RGBA = { r: 240, g: 240, b: 240, a: 1 };

    expect(modifyBackgroundColor(color, { ...DEFAULT_THEME })).toBe(
      modifyBackgroundColor(color, { ...DEFAULT_THEME }),
    );
    expect(modifyBorderColor(color, { ...ADJUSTED_THEME })).toBe(
      modifyBorderColor(color, { ...ADJUSTED_THEME }),
    );
  });
});

describe("DEFAULT_THEME", () => {
  test("keeps its published values", () => {
    expect(DEFAULT_THEME).toEqual({
      mode: 1,
      brightness: 100,
      contrast: 100,
      grayscale: 0,
      sepia: 0,
      backgroundColor: "#181a1b",
      textColor: "#e8e6e3",
    });
  });
});
