import {
  type HSLA,
  hslToRGB,
  parseColorWithCache,
  type RGBA,
  rgbToHexString,
  rgbToHSL,
  rgbToString,
} from "./color";
import { scale } from "./math";
import { type ColorMatrix, composeFilterMatrix, transformColorChannels } from "./matrix";
import { getThemeValueKey, type Theme } from "./theme";

const MAX_BACKGROUND_LIGHTNESS = 0.4;
const MIN_FOREGROUND_LIGHTNESS = 0.55;

function remapBackgroundHSL(hsl: HSLA, pole: HSLA): HSLA {
  const { h: hue, s: saturation, l: lightness, a: alpha } = hsl;
  const isBluish = hue > 200 && hue < 280;
  const isNearGray = saturation < 0.12 || (lightness > 0.8 && isBluish);

  if (lightness < 0.5) {
    const mappedLightness = scale(lightness, 0, 0.5, 0, MAX_BACKGROUND_LIGHTNESS);

    if (isNearGray) {
      return { h: pole.h, s: pole.s, l: mappedLightness, a: alpha };
    }

    return { h: hue, s: saturation, l: mappedLightness, a: alpha };
  }

  let mappedLightness = scale(lightness, 0.5, 1, MAX_BACKGROUND_LIGHTNESS, pole.l);

  if (isNearGray) {
    return { h: pole.h, s: pole.s, l: mappedLightness, a: alpha };
  }

  // Yellows shift toward orange or green so a pale yellow surface doesn't turn
  // into a murky olive on the dark background.
  let mappedHue = hue;

  if (hue > 60 && hue < 180) {
    mappedHue = hue > 120 ? scale(hue, 120, 180, 135, 180) : scale(hue, 60, 120, 60, 105);
  }

  if (mappedHue > 40 && mappedHue < 80) {
    mappedLightness *= 0.75;
  }

  return { h: mappedHue, s: saturation, l: mappedLightness, a: alpha };
}

function softenBlueHue(hue: number): number {
  return scale(hue, 205, 245, 205, 220);
}

function remapForegroundHSL(hsl: HSLA, pole: HSLA): HSLA {
  const { h: hue, s: saturation, l: lightness, a: alpha } = hsl;
  const isNearGray = lightness < 0.2 || saturation < 0.24;
  const isBluish = !isNearGray && hue > 205 && hue < 245;

  if (lightness > 0.5) {
    const mappedLightness = scale(lightness, 0.5, 1, MIN_FOREGROUND_LIGHTNESS, pole.l);

    if (isNearGray) {
      return { h: pole.h, s: pole.s, l: mappedLightness, a: alpha };
    }

    return { h: isBluish ? softenBlueHue(hue) : hue, s: saturation, l: mappedLightness, a: alpha };
  }

  if (isNearGray) {
    return {
      h: pole.h,
      s: pole.s,
      l: scale(lightness, 0, 0.5, pole.l, MIN_FOREGROUND_LIGHTNESS),
      a: alpha,
    };
  }

  if (isBluish) {
    return {
      h: softenBlueHue(hue),
      s: saturation,
      l: scale(lightness, 0, 0.5, pole.l, Math.min(1, MIN_FOREGROUND_LIGHTNESS + 0.05)),
      a: alpha,
    };
  }

  return {
    h: hue,
    s: saturation,
    l: scale(lightness, 0, 0.5, pole.l, MIN_FOREGROUND_LIGHTNESS),
    a: alpha,
  };
}

function remapBorderHSL(hsl: HSLA, textPole: HSLA, backgroundPole: HSLA): HSLA {
  const { h: hue, s: saturation, l: lightness, a: alpha } = hsl;
  const mappedLightness = scale(lightness, 0, 1, 0.5, 0.2);

  if (lightness < 0.2 || saturation < 0.24) {
    const pole = lightness < 0.5 ? textPole : backgroundPole;

    return { h: pole.h, s: pole.s, l: mappedLightness, a: alpha };
  }

  return { h: hue, s: saturation, l: mappedLightness, a: alpha };
}

type ColorRemapper = (hsl: HSLA) => HSLA;

// Colors that are in-gamut integers with full alpha — the overwhelmingly common
// case — memoize under a packed 24-bit integer key; everything else (fractional
// or out-of-gamut channels, translucency) falls back to a string key. Alpha is
// part of the output string verbatim, so the key must encode it losslessly —
// quantizing it would collide colors with different formatted alphas.
type ColorCache = {
  packed: Map<number, string>;
  keyed: Map<string, string>;
};

type ThemeState = {
  filterMatrix: ColorMatrix | null;
  backgroundRemap: ColorRemapper | null;
  foregroundRemap: ColorRemapper | null;
  borderRemap: ColorRemapper | null;
  backgroundCache: ColorCache;
  foregroundCache: ColorCache;
  borderCache: ColorCache;
};

function createColorCache(): ColorCache {
  return { packed: new Map(), keyed: new Map() };
}

function parsePoleColor(poleColorText: string): HSLA | null {
  const poleRGB = parseColorWithCache(poleColorText);

  return poleRGB ? rgbToHSL(poleRGB) : null;
}

function createThemeState(theme: Theme): ThemeState {
  const backgroundPole = parsePoleColor(theme.backgroundColor);
  const textPole = parsePoleColor(theme.textColor);

  const hasAdjustments =
    theme.brightness !== 100 ||
    theme.contrast !== 100 ||
    theme.grayscale !== 0 ||
    theme.sepia !== 0;

  return {
    filterMatrix: hasAdjustments ? composeFilterMatrix({ ...theme, mode: 0 }) : null,
    backgroundRemap: backgroundPole && ((hsl) => remapBackgroundHSL(hsl, backgroundPole)),
    foregroundRemap: textPole && ((hsl) => remapForegroundHSL(hsl, textPole)),
    borderRemap:
      textPole && backgroundPole && ((hsl) => remapBorderHSL(hsl, textPole, backgroundPole)),
    backgroundCache: createColorCache(),
    foregroundCache: createColorCache(),
    borderCache: createColorCache(),
  };
}

const themeStatesByIdentity = new WeakMap<Theme, ThemeState>();
const themeStatesByValue = new Map<string, ThemeState>();

// The engine passes one theme object through a whole applyDarkTheme run, so the
// WeakMap identity hit is the hot path; the value-keyed map only steps in to
// dedupe distinct-but-equal theme objects across runs.
function resolveThemeState(theme: Theme): ThemeState {
  const identityMatch = themeStatesByIdentity.get(theme);

  if (identityMatch) {
    return identityMatch;
  }

  const themeValueKey = getThemeValueKey(theme);
  let themeState = themeStatesByValue.get(themeValueKey);

  if (!themeState) {
    themeState = createThemeState(theme);
    themeStatesByValue.set(themeValueKey, themeState);
  }

  themeStatesByIdentity.set(theme, themeState);

  return themeState;
}

export function clearColorModificationCache() {
  for (const themeState of themeStatesByValue.values()) {
    themeState.backgroundCache.packed.clear();
    themeState.backgroundCache.keyed.clear();
    themeState.foregroundCache.packed.clear();
    themeState.foregroundCache.keyed.clear();
    themeState.borderCache.packed.clear();
    themeState.borderCache.keyed.clear();
  }
}

function isPackableChannel(channelValue: number): boolean {
  return Number.isInteger(channelValue) && channelValue >= 0 && channelValue <= 255;
}

function remapThroughCache(
  rgb: RGBA,
  themeState: ThemeState,
  cache: ColorCache,
  remap: ColorRemapper,
): string {
  const isPackable =
    (rgb.a === 1 || rgb.a === undefined) &&
    isPackableChannel(rgb.r) &&
    isPackableChannel(rgb.g) &&
    isPackableChannel(rgb.b);

  const packedKey = isPackable ? (rgb.r << 16) | (rgb.g << 8) | rgb.b : 0;
  const stringKey = isPackable ? "" : `${rgb.r},${rgb.g},${rgb.b},${rgb.a}`;
  const cached = isPackable ? cache.packed.get(packedKey) : cache.keyed.get(stringKey);

  if (cached !== undefined) {
    return cached;
  }

  const { r, g, b, a } = hslToRGB(remap(rgbToHSL(rgb)));
  const [red, green, blue] = themeState.filterMatrix
    ? transformColorChannels(r, g, b, themeState.filterMatrix)
    : [r, g, b];

  const color =
    a === 1
      ? rgbToHexString({ r: red, g: green, b: blue })
      : rgbToString({ r: red, g: green, b: blue, a });

  if (isPackable) {
    cache.packed.set(packedKey, color);
  } else {
    cache.keyed.set(stringKey, color);
  }

  return color;
}

export function modifyBackgroundColor(rgb: RGBA, theme: Theme): string {
  const themeState = resolveThemeState(theme);

  if (!themeState.backgroundRemap) {
    return rgbToHexString(rgb);
  }

  return remapThroughCache(rgb, themeState, themeState.backgroundCache, themeState.backgroundRemap);
}

export function modifyForegroundColor(rgb: RGBA, theme: Theme): string {
  const themeState = resolveThemeState(theme);

  if (!themeState.foregroundRemap) {
    return rgbToHexString(rgb);
  }

  return remapThroughCache(rgb, themeState, themeState.foregroundCache, themeState.foregroundRemap);
}

export function modifyBorderColor(rgb: RGBA, theme: Theme): string {
  const themeState = resolveThemeState(theme);

  if (!themeState.borderRemap) {
    return rgbToHexString(rgb);
  }

  return remapThroughCache(rgb, themeState, themeState.borderCache, themeState.borderRemap);
}
