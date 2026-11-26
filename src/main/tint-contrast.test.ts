import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PROFILE_COLOR_NAMES, paletteColor } from "#core/profile-color.ts";

type Lab = readonly [number, number, number];

const css = readFileSync(
  path.join(import.meta.dirname, "..", "ui", "styles.css"),
  "utf-8"
);

/** Every value the stylesheet gives `token`, in its order: light, then dark. */
const declared = (token: string) =>
  [...css.matchAll(new RegExp(`${token}: ([^;]+);`, "gu"))].map(
    (match) => match[1] ?? ""
  );

const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const linearToLab = ([red, green, blue]: readonly number[]): Lab => {
  const r = red ?? 0;
  const g = green ?? 0;
  const b = blue ?? 0;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

const labToLinear = ([lightness, a, b]: Lab) => {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.min(1, Math.max(0, channel)));
};

/** A hex or `oklch(L C h)` colour as the stylesheet and the palette write them. */
const parse = (color: string): Lab => {
  const hex = /^#(?<hex>[\da-f]{6})$/iu.exec(color)?.groups?.hex;

  if (hex) {
    return linearToLab(
      [0, 2, 4].map((at) =>
        toLinear(Number.parseInt(hex.slice(at, at + 2), 16) / 255)
      )
    );
  }

  const parts = /^oklch\((?<l>[\d.]+) (?<c>[\d.]+) (?<h>[\d.]+)\)$/u.exec(
    color
  )?.groups;

  if (!parts) {
    throw new Error(`Not a colour this test reads: ${color}`);
  }

  const chroma = Number(parts.c);
  const hue = (Number(parts.h) * Math.PI) / 180;

  return [Number(parts.l), chroma * Math.cos(hue), chroma * Math.sin(hue)];
};

/** `color-mix(in oklab, from, to percent)`, for opaque colours. */
const mix = (from: Lab, to: Lab, percent: number): Lab => [
  from[0] + (to[0] - from[0]) * (percent / 100),
  from[1] + (to[1] - from[1]) * (percent / 100),
  from[2] + (to[2] - from[2]) * (percent / 100),
];

const luminance = (color: Lab) => {
  const [red = 0, green = 0, blue = 0] = labToLinear(color);

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

/** WCAG's contrast ratio. */
const contrast = (one: Lab, other: Lab) => {
  const [lighter, darker] = [luminance(one), luminance(other)].toSorted(
    (a, b) => b - a
  );

  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
};

const THEMES = ["light", "dark"] as const;

/** The token's value in the theme: `:root`'s first, its dark block's second. */
const token = (name: string, theme: (typeof THEMES)[number]) => {
  const values = declared(`--${name}`);
  const value = values[theme === "light" ? 0 : 1];

  if (value === undefined) {
    throw new Error(`styles.css gives --${name} no ${theme} value`);
  }

  return parse(value);
};

/** The shell's share of the tint per strength, read as `[data-tint]` sets it. */
const strengths = (theme: (typeof THEMES)[number]) => {
  const [medium, low, high] = declared("--tint-amount")
    .slice(theme === "light" ? 0 : 3)
    .map((value) => Number(value.replace("%", "")));

  return { low, medium, high };
};

describe("the profile tint", () => {
  it("takes 12, 20 and 28% of the profile's colour in light and 8, 12 and 18% in dark", () => {
    expect(THEMES.map(strengths)).toStrictEqual([
      { low: 12, medium: 20, high: 28 },
      { low: 8, medium: 12, high: 18 },
    ]);
  });

  it.each(THEMES)(
    "keeps the text at least 4.5:1 on the shell at High for every profile colour, %s",
    (theme) => {
      const high = strengths(theme).high ?? 0;
      const shell = token("shell", theme);
      const text = token("foreground", theme);

      const failing = PROFILE_COLOR_NAMES.filter(
        (name) =>
          contrast(text, mix(shell, parse(paletteColor(name)), high)) < 4.5
      );

      expect(failing).toStrictEqual([]);
    }
  );
});
