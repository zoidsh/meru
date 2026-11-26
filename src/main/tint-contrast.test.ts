import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PROFILE_COLOR_NAMES, paletteColor } from "#core/profile-color.ts";

type Lab = readonly [number, number, number];

const css = readFileSync(
  path.join(import.meta.dirname, "..", "ui", "styles.css"),
  "utf-8"
);

/**
 * Every value the stylesheet gives `token` of its own, in its order: light,
 * then dark. One that names another token, as `[data-tinted]` hands the
 * shell's on, is left out.
 */
const declared = (token: string) =>
  [...css.matchAll(new RegExp(`^\\s+${token}: ([^;]+);`, "gmu"))]
    .map((match) => match[1] ?? "")
    .filter((value) => !value.startsWith("var("));

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

/** `color` at `opacity` over `ground`, composited in sRGB as Chromium does. */
const over = (color: Lab, ground: Lab, opacity: number): Lab => {
  const encode = (lab: Lab) =>
    labToLinear(lab).map((channel) =>
      channel <= 0.0031308
        ? 12.92 * channel
        : 1.055 * channel ** (1 / 2.4) - 0.055
    );
  const groundChannels = encode(ground);

  return linearToLab(
    encode(color).map((channel, at) =>
      toLinear(channel * opacity + (groundChannels[at] ?? 0) * (1 - opacity))
    )
  );
};

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

type Theme = (typeof THEMES)[number];

/**
 * The shell's muted text and icons: the theme's `--tint-muted-foreground`,
 * a token mixed with the profile's colour, or with its fallback untinted.
 */
const mutedForeground = (theme: Theme, tint: Lab | undefined) => {
  const value = declared("--tint-muted-foreground")[theme === "light" ? 0 : 1];
  const parts =
    /^color-mix\(\s*in oklab,\s*var\(--(?<base>[\w-]+)\),\s*var\(--tint, (?<fallback>.+)\) (?<percent>\d+)%\s*\)$/su.exec(
      value ?? ""
    )?.groups;

  if (!parts?.base || !parts.fallback || !parts.percent) {
    throw new Error(`Not a mix this test reads: ${value}`);
  }

  const named = /^var\(--(?<name>[\w-]+)\)$/u.exec(parts.fallback)?.groups
    ?.name;
  const fallback = named ? token(named, theme) : parse(parts.fallback);

  return mix(token(parts.base, theme), tint ?? fallback, Number(parts.percent));
};

/** What `contrast` gives below the bar, by where: empty when all pass. */
const below = (bar: number, cases: readonly (readonly [string, Lab, Lab])[]) =>
  cases
    .filter(([, one, other]) => contrast(one, other) < bar)
    .map(
      ([where, one, other]) => `${where} ${contrast(one, other).toFixed(2)}`
    );

/** Untinted, then each colour at each strength, the shell and the muted foreground. */
const shells = (theme: Theme) => {
  const shell = token("shell", theme);
  const amounts = strengths(theme);

  return [
    ["untinted", shell, mutedForeground(theme, undefined)] as const,
    ...PROFILE_COLOR_NAMES.flatMap((name) => {
      const tint = parse(paletteColor(name));

      return (["low", "medium", "high"] as const).map(
        (strength) =>
          [
            `${name} ${strength}`,
            mix(shell, tint, amounts[strength] ?? 0),
            mutedForeground(theme, tint),
          ] as const
      );
    }),
  ];
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

  it.each(THEMES)(
    "keeps the shell's muted text at least 4.5:1, so its icons pass 3:1, untinted and at every strength for every profile colour, %s",
    (theme) => {
      expect(
        below(
          4.5,
          shells(theme).map(([where, shell, muted]) => [where, muted, shell])
        )
      ).toStrictEqual([]);
    }
  );

  it.each(THEMES)(
    "draws a disabled control's half-opacity icon weaker than an enabled one's yet at least 2:1, %s",
    (theme) => {
      const disabled = shells(theme).map(
        ([where, shell, muted]) =>
          [where, over(muted, shell, 0.5), shell, muted] as const
      );

      expect(
        below(
          2,
          disabled.map(([where, dimmed, shell]) => [where, dimmed, shell])
        )
      ).toStrictEqual([]);
      expect(
        disabled.filter(
          ([, dimmed, shell, muted]) =>
            contrast(dimmed, shell) >= contrast(muted, shell)
        )
      ).toStrictEqual([]);
    }
  );

  it("leaves the dark shell's muted grey as it was untinted", () => {
    expect(mutedForeground("dark", undefined)).toStrictEqual(
      token("muted-foreground", "dark")
    );
  });
});
