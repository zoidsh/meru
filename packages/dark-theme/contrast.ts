import { hslToRGB, type RGBA, rgbToHSL } from "./color";

function channelLuminance(value: number): number {
  const srgb = value / 255;

  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

// WCAG relative luminance (opaque colors; alpha is ignored).
export function relativeLuminance({ r, g, b }: RGBA): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(a: RGBA, b: RGBA): number {
  const luminanceA = relativeLuminance(a);
  const luminanceB = relativeLuminance(b);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);

  return (lighter + 0.05) / (darker + 0.05);
}

// Lighten `color` (keeping its hue and saturation) until it reaches `targetRatio`
// contrast against `against`, capped at `maxLightness` and at `maxLuminance` (used
// to stop before text on `color` loses its own contrast). Returns the original
// color when it already meets the target or can't be lifted. Luminance rises
// monotonically with lightness, so a binary search finds the smallest fit.
export function raiseToContrast(
  color: RGBA,
  against: RGBA,
  targetRatio: number,
  maxLightness: number,
  maxLuminance = Number.POSITIVE_INFINITY,
): RGBA {
  if (contrastRatio(color, against) >= targetRatio) {
    return color;
  }

  const targetLuminance = Math.min(
    targetRatio * (relativeLuminance(against) + 0.05) - 0.05,
    maxLuminance,
  );

  if (relativeLuminance(color) >= targetLuminance) {
    return color;
  }

  const hsl = rgbToHSL(color);

  if (hsl.l >= maxLightness) {
    return color;
  }

  let low = hsl.l;
  let high = maxLightness;

  // Converge on the target from below so we never overshoot the luminance cap
  // (which would push the control's text under its contrast ratio).
  for (let step = 0; step < 16; step++) {
    const mid = (low + high) / 2;
    const luminance = relativeLuminance(hslToRGB({ h: hsl.h, s: hsl.s, l: mid, a: hsl.a }));

    if (luminance >= targetLuminance) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return hslToRGB({ h: hsl.h, s: hsl.s, l: low, a: hsl.a });
}
