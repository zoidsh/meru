import { parse, type RGBA } from "./color";
import { modifyBackgroundColor } from "./modify-colors";
import type { Theme } from "./theme";

const colorTokenRegex = /rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]+/gi;

// Replaces every color token in a CSS value (gradient stops, shadow colors, a
// shorthand's color) via `modify`, leaving non-color tokens (positions, widths,
// var() references) intact. `modify` may return null to leave a token untouched.
export function modifyColorTokens(value: string, modify: (rgb: RGBA) => string | null): string {
  return value.replace(colorTokenRegex, (token) => {
    const rgb = parse(token);

    if (!rgb) {
      return token;
    }

    return modify(rgb) ?? token;
  });
}

// Remaps color tokens through the background color math. Dark Reader remaps both
// gradients and shadows this way (modifyGradientColor and modifyShadowColor both
// delegate to it).
export function replaceColorTokens(value: string, theme: Theme): string {
  return modifyColorTokens(value, (rgb) => modifyBackgroundColor(rgb, theme));
}
