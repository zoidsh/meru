/*
 * Ported from Dark Reader (https://github.com/darkreader/darkreader),
 * MIT License, Copyright (c) 2018-present Dark Reader Ltd.
 * Reduced to the dark-scheme paths and stripped of Dark Reader's CSS-variable
 * registration; the HSL remapping math is unchanged.
 */

import {
  type HSLA,
  hslToRGB,
  parseToHSLWithCache,
  type RGBA,
  rgbToHexString,
  rgbToHSL,
  rgbToString,
} from "./color";
import { scale } from "./math";
import { applyColorMatrix, createFilterMatrix } from "./matrix";
import type { Theme } from "./theme";

type HSLModifier = (hsl: HSLA, poleA: HSLA, poleB: HSLA) => HSLA;

const colorModificationCache = new Map<HSLModifier, Map<string, string>>();

export function clearColorModificationCache() {
  colorModificationCache.clear();
}

const themeCacheKeys: Array<keyof Theme> = [
  "mode",
  "brightness",
  "contrast",
  "grayscale",
  "sepia",
  "darkSchemeBackgroundColor",
  "darkSchemeTextColor",
];

function getCacheId(rgb: RGBA, theme: Theme, poleColorA?: string, poleColorB?: string): string {
  let cacheId = "";

  for (const key of ["r", "g", "b", "a"] as Array<keyof RGBA>) {
    cacheId += `${rgb[key]};`;
  }

  for (const key of themeCacheKeys) {
    cacheId += `${theme[key]};`;
  }

  cacheId += `${poleColorA};${poleColorB}`;

  return cacheId;
}

function modifyColorWithCache(
  rgb: RGBA,
  theme: Theme,
  modifyHSL: HSLModifier,
  poleColorA: string,
  poleColorB?: string,
): string {
  let functionCache = colorModificationCache.get(modifyHSL);

  if (!functionCache) {
    functionCache = new Map();
    colorModificationCache.set(modifyHSL, functionCache);
  }

  const cacheId = getCacheId(rgb, theme, poleColorA, poleColorB);
  const cached = functionCache.get(cacheId);

  if (cached !== undefined) {
    return cached;
  }

  const hsl = rgbToHSL(rgb);
  const poleA = parseToHSLWithCache(poleColorA);
  const poleB = poleColorB == null ? poleA : parseToHSLWithCache(poleColorB);

  if (!poleA || !poleB) {
    return rgbToHexString(rgb);
  }

  const modified = modifyHSL(hsl, poleA, poleB);
  const { r, g, b, a } = hslToRGB(modified);
  const matrix = createFilterMatrix({ ...theme, mode: 0 });
  const [red, green, blue] = applyColorMatrix([r, g, b], matrix);

  const color =
    a === 1
      ? rgbToHexString({ r: red, g: green, b: blue })
      : rgbToString({ r: red, g: green, b: blue, a });

  functionCache.set(cacheId, color);

  return color;
}

const MAX_BG_LIGHTNESS = 0.4;

function modifyBgHSL({ h, s, l, a }: HSLA, pole: HSLA): HSLA {
  const isDark = l < 0.5;
  const isBlue = h > 200 && h < 280;
  const isNeutral = s < 0.12 || (l > 0.8 && isBlue);

  if (isDark) {
    const darkLightness = scale(l, 0, 0.5, 0, MAX_BG_LIGHTNESS);

    if (isNeutral) {
      return { h: pole.h, s: pole.s, l: darkLightness, a };
    }

    return { h, s, l: darkLightness, a };
  }

  let lightness = scale(l, 0.5, 1, MAX_BG_LIGHTNESS, pole.l);

  if (isNeutral) {
    return { h: pole.h, s: pole.s, l: lightness, a };
  }

  let hue = h;
  const isYellow = h > 60 && h < 180;

  if (isYellow) {
    const isCloserToGreen = h > 120;

    if (isCloserToGreen) {
      hue = scale(h, 120, 180, 135, 180);
    } else {
      hue = scale(h, 60, 120, 60, 105);
    }
  }

  // Lower the lightness if the resulting hue is in the lower yellow spectrum.
  if (hue > 40 && hue < 80) {
    lightness *= 0.75;
  }

  return { h: hue, s, l: lightness, a };
}

const MIN_FG_LIGHTNESS = 0.55;

function modifyBlueFgHue(hue: number): number {
  return scale(hue, 205, 245, 205, 220);
}

function modifyFgHSL({ h, s, l, a }: HSLA, pole: HSLA): HSLA {
  const isLight = l > 0.5;
  const isNeutral = l < 0.2 || s < 0.24;
  const isBlue = !isNeutral && h > 205 && h < 245;

  if (isLight) {
    const lightness = scale(l, 0.5, 1, MIN_FG_LIGHTNESS, pole.l);

    if (isNeutral) {
      return { h: pole.h, s: pole.s, l: lightness, a };
    }

    return { h: isBlue ? modifyBlueFgHue(h) : h, s, l: lightness, a };
  }

  if (isNeutral) {
    return { h: pole.h, s: pole.s, l: scale(l, 0, 0.5, pole.l, MIN_FG_LIGHTNESS), a };
  }

  if (isBlue) {
    return {
      h: modifyBlueFgHue(h),
      s,
      l: scale(l, 0, 0.5, pole.l, Math.min(1, MIN_FG_LIGHTNESS + 0.05)),
      a,
    };
  }

  return { h, s, l: scale(l, 0, 0.5, pole.l, MIN_FG_LIGHTNESS), a };
}

function modifyBorderHSL({ h, s, l, a }: HSLA, poleFg: HSLA, poleBg: HSLA): HSLA {
  const isDark = l < 0.5;
  const isNeutral = l < 0.2 || s < 0.24;

  let hue = h;
  let saturation = s;

  if (isNeutral) {
    const pole = isDark ? poleFg : poleBg;
    hue = pole.h;
    saturation = pole.s;
  }

  return { h: hue, s: saturation, l: scale(l, 0, 1, 0.5, 0.2), a };
}

export function modifyBackgroundColor(rgb: RGBA, theme: Theme): string {
  return modifyColorWithCache(rgb, theme, modifyBgHSL, theme.darkSchemeBackgroundColor);
}

export function modifyForegroundColor(rgb: RGBA, theme: Theme): string {
  return modifyColorWithCache(rgb, theme, modifyFgHSL, theme.darkSchemeTextColor);
}

export function modifyBorderColor(rgb: RGBA, theme: Theme): string {
  return modifyColorWithCache(
    rgb,
    theme,
    modifyBorderHSL,
    theme.darkSchemeTextColor,
    theme.darkSchemeBackgroundColor,
  );
}
