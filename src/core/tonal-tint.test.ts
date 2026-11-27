import { describe, expect, it } from "vitest";

import { PROFILE_COLOR_NAMES, paletteColor } from "./profile-color.ts";
import type { ProfileColorName } from "./profile-color.ts";
import { TONAL_ROLES, contrastRatio, tonalTokens } from "./tonal-tint.ts";
import type { TonalRole, TonalTheme } from "./tonal-tint.ts";

const THEMES = ["light", "dark"] as const satisfies readonly TonalTheme[];

/**
 * Each palette colour's tokens in `TONAL_ROLES`' order, as the design
 * prototype the palette was chosen from computed them with its own engine,
 * independent of this code; this must match it hex for hex.
 */
const PROTOTYPE: Record<ProfileColorName, Record<TonalTheme, string>> = {
  blue: {
    light:
      "#d7e3ff #0f1629 #e9f0ff #0c1323 #e9f0ff #0c1323 #2b4bb3 #f9fbff #bcd1ff #111a33 #ccdcff #404e6d #cfdeff #0f1629 #c3cfea #647498 #3f62c5",
    dark: "#222a3c #f1f5ff #181e2b #eef3ff #181e2b #eef3ff #a7c1ff #121a2d #374360 #f1f5ff #2d364d #a5b1cb #2d364d #f1f5ff #404859 #6d7a99 #739afb",
  },
  orange: {
    light:
      "#ffded3 #261009 #ffebe5 #210e08 #ffebe5 #210e08 #962e00 #fffaf8 #fbc4b2 #2f1209 #fcd1c3 #694438 #ffd7ca #261009 #e8c7bd #94695a #b33f10",
    dark: "#39241d #fff2ee #2a1914 #fff0eb #2a1914 #fff0eb #ffaa8e #2a140c #5c3a2f #fff2ee #4a2f26 #c9a99f #4a2f26 #fff2ee #57423b #957165 #eb7954",
  },
  green: {
    light:
      "#d4eed8 #081c0d #e9fbeb #07180b #e9fbeb #07180b #00692d #f4fef6 #b4e0bb #07220f #c4e6ca #38573e #d1f0d6 #081c0d #bed7c2 #5b7f62 #008039",
    dark: "#1d2f21 #edf9ef #142217 #ebf8ec #142217 #ebf8ec #81da95 #0b2010 #2f4c35 #edf9ef #273d2b #a0b9a4 #273d2b #edf9ef #3c4d3f #65836b #4cb86a",
  },
  pink: {
    light:
      "#f6ddf3 #211020 #ffedfd #1c0e1b #ffedfd #1c0e1b #872582 #fff9fe #edc3e8 #281227 #f0d0ec #60435d #fadbf6 #211020 #dfc6dc #896885 #9b4095",
    dark: "#342432 #fdf1fb #261924 #fceffa #261924 #fceffa #f2a3ea #251323 #543951 #fdf1fb #432f41 #c0a8bd #432f41 #fdf1fb #524250 #8c7089 #d179ca",
  },
  cyan: {
    light:
      "#c8eff1 #001c1e #e0fbfd #00181a #e0fbfd #00181a #006368 #f0feff #9de1e4 #002123 #b4e7e9 #24585a #c2f1f3 #001c1e #b2d8da #467f82 #00797f",
    dark: "#122f31 #e8f9fa #0c2223 #e5f8f9 #0c2223 #e5f8f9 #31dbe3 #002022 #1b4c4f #e8f9fa #183d3f #94b9bb #183d3f #e8f9fa #334d4e #568486 #00b4bb",
  },
  lime: {
    light:
      "#e0ebcf #131a05 #f1f9e5 #101605 #f1f9e5 #101605 #486100 #f8fdf2 #c8dbaa #162003 #d4e2bd #475432 #dfecca #131a05 #c9d4b8 #6c7b54 #597700",
    dark: "#262d1a #f2f7ea #1b2012 #f0f6e8 #1b2012 #f0f6e8 #afd170 #161e08 #3d4929 #f2f7ea #323b22 #abb69b #323b22 #f2f7ea #444b38 #73805f #89ae37",
  },
  amber: {
    light:
      "#f5e4c9 #211501 #fef2df #1c1202 #fef2df #1c1202 #725000 #fffaf3 #eacea0 #281900 #eed9b6 #5e4b2a #f7e3c3 #211501 #ddcdb3 #87714b #8b6200",
    dark: "#332815 #fcf4e8 #251d0e #fbf2e5 #251d0e #fbf2e5 #eeb957 #241803 #524122 #fcf4e8 #42341d #bfaf95 #42341d #fcf4e8 #514634 #8a7759 #cd9200",
  },
  violet: {
    light:
      "#e1e1ff #151429 #eeeeff #121123 #eeeeff #121123 #523faf #fafbff #cdcdfe #1a1832 #d7d8fe #4b4a6c #dcdcff #151429 #cccce9 #707097 #6457c1",
    dark: "#28283b #f4f4ff #1d1c2b #f2f2ff #1d1c2b #f2f2ff #bcbaff #19182c #41405f #f4f4ff #34344c #aeaeca #34344c #f4f4ff #464559 #777797 #968ff7",
  },
};

/**
 * Where each role is read, and the contrast it needs there, as the prototype
 * measured them; a pair that is decorative or exempt needs none.
 */
const PAIRS: readonly (readonly [
  where: string,
  foreground: TonalRole,
  surface: TonalRole,
  ratio: number,
])[] = [
  ["an icon at rest on the frame", "muted-foreground", "shell", 3],
  ["a profile name at rest on the frame", "muted-foreground", "shell", 4.5],
  ["the window's text on the frame", "foreground", "shell", 4.5],
  ["a hovered control's label", "foreground", "muted", 4.5],
  ["a selected container's label", "secondary-foreground", "secondary", 4.5],
  ["a selected tile's icon", "secondary-foreground", "secondary", 3],
  ["the trial footer's text", "muted-foreground", "shell", 4.5],
  ["the footer button's label", "foreground", "card", 4.5],
  ["a card's text", "card-foreground", "card", 4.5],
  ["a card's secondary text", "muted-foreground", "card", 4.5],
  ["a highlighted menu item", "accent-foreground", "accent", 4.5],
  ["a toast's text", "popover-foreground", "popover", 4.5],
  ["the primary button's label", "primary-foreground", "primary", 4.5],
  ["the primary button against the frame", "primary", "shell", 3],
  ["a focus ring on the frame", "ring", "shell", 3],
  ["a focus ring on a selected container", "ring", "secondary", 3],
  ["a focus ring on a card", "ring", "card", 3],
  ["a text field's edge on a card", "input", "card", 3],
];

const cases = PROFILE_COLOR_NAMES.flatMap((name) =>
  THEMES.map((theme) => [name, theme] as const)
);

describe(tonalTokens, () => {
  it.each(cases)(
    "gives %s in %s the prototype's palette, hex for hex",
    (name, theme) => {
      const tokens = tonalTokens(paletteColor(name), theme);

      expect(TONAL_ROLES.map((role) => tokens[role])).toStrictEqual(
        PROTOTYPE[name][theme].split(" ")
      );
    }
  );

  it("meets every pair's ratio for every profile colour in both themes", () => {
    const measured = cases.flatMap(([name, theme]) => {
      const tokens = tonalTokens(paletteColor(name), theme);

      return PAIRS.map(([where, foreground, surface, ratio]) => ({
        where: `${name} ${theme}: ${where}`,
        ratio: contrastRatio(tokens[foreground], tokens[surface]),
        needed: ratio,
      }));
    });

    expect(measured).toHaveLength(288);
    expect(
      measured
        .filter(({ ratio, needed }) => ratio < needed)
        .map(({ where, ratio }) => `${where} ${ratio.toFixed(2)}`)
    ).toStrictEqual([]);
  });

  it("reads the hue alone, so one colour written as hex or as oklch gives one palette", () => {
    expect(tonalTokens("#2d52d2", "light")).toStrictEqual(
      tonalTokens(paletteColor("blue"), "light")
    );
    expect(tonalTokens("oklch(0.3 0.05 150)", "dark")).toStrictEqual(
      tonalTokens(paletteColor("green"), "dark")
    );
  });

  it("refuses a colour it cannot read", () => {
    expect(() => tonalTokens("rebeccapurple", "light")).toThrow(
      "Not a colour the tint reads: rebeccapurple"
    );
  });
});
