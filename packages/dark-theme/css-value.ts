import { parseColorWithCache, type RGBA } from "./color";
import { modifyBackgroundColor } from "./modify-colors";
import type { Theme } from "./theme";

const colorTokenStartRegex = /rgba?\(|hsla?\(|#[0-9a-f]+/gi;

// Replaces every color token in a CSS value (gradient stops, shadow colors, a
// shorthand's color) via `modify`, leaving non-color tokens (positions, widths,
// var() references) intact. `modify` may return null to leave a token untouched.
//
// Function tokens are extracted with paren counting because they can nest
// further parens (`rgb(from var(--x, #fff) r g b / .08)`); a regex that stops at
// the first `)` splits such tokens and emits unbalanced CSS. Tokens containing
// `var()` can't be evaluated statically — canvas-based parsing silently returns
// a stale color for them — so they're always left untouched.
export function modifyColorTokens(value: string, modify: (rgb: RGBA) => string | null): string {
  colorTokenStartRegex.lastIndex = 0;

  let result = "";
  let lastIndex = 0;

  while (true) {
    const match = colorTokenStartRegex.exec(value);

    if (!match) {
      break;
    }

    let tokenEnd = match.index + match[0].length;

    if (match[0].endsWith("(")) {
      let parenDepth = 1;

      while (tokenEnd < value.length && parenDepth > 0) {
        const character = value[tokenEnd];

        if (character === "(") {
          parenDepth++;
        } else if (character === ")") {
          parenDepth--;
        }

        tokenEnd++;
      }
    }

    const token = value.slice(match.index, tokenEnd);
    const rgb = token.includes("var(") ? null : parseColorWithCache(token);

    result += value.slice(lastIndex, match.index);
    result += rgb ? (modify(rgb) ?? token) : token;

    lastIndex = tokenEnd;
    colorTokenStartRegex.lastIndex = tokenEnd;
  }

  return result + value.slice(lastIndex);
}

// Remaps color tokens through the background color math. Dark Reader remaps both
// gradients and shadows this way (modifyGradientColor and modifyShadowColor both
// delegate to it).
export function replaceColorTokens(value: string, theme: Theme): string {
  return modifyColorTokens(value, (rgb) => modifyBackgroundColor(rgb, theme));
}

const varReferenceStartRegex = /var\(\s*(--[\w-]+)\s*/g;

// Replaces every `var(--x, fallback)` with its fallback text, innermost-first
// (`var(--a, var(--b, #fff))` becomes `#fff`), so a value can be darkened
// without depending on what the page resolves the variable to at runtime —
// definitions set via inline styles or constructed stylesheets are invisible to
// any stylesheet walk. A `var(--x)` without a fallback is left intact.
export function substituteVarFallbacks(value: string): string {
  let substitutedValue = value;
  let searchFrom = 0;

  while (true) {
    varReferenceStartRegex.lastIndex = searchFrom;

    const match = varReferenceStartRegex.exec(substitutedValue);

    if (!match) {
      return substitutedValue;
    }

    let scanIndex = match.index + match[0].length;
    let parenDepth = 1;
    let fallbackStart = -1;

    while (scanIndex < substitutedValue.length && parenDepth > 0) {
      const character = substitutedValue[scanIndex];

      if (character === "(") {
        parenDepth++;
      } else if (character === ")") {
        parenDepth--;
      } else if (character === "," && parenDepth === 1 && fallbackStart === -1) {
        fallbackStart = scanIndex + 1;
      }

      if (parenDepth > 0) {
        scanIndex++;
      }
    }

    if (parenDepth > 0) {
      return substitutedValue;
    }

    if (fallbackStart === -1) {
      searchFrom = scanIndex + 1;

      continue;
    }

    const fallback = substitutedValue.slice(fallbackStart, scanIndex).trim();

    substitutedValue =
      substitutedValue.slice(0, match.index) + fallback + substitutedValue.slice(scanIndex + 1);
    searchFrom = match.index;
  }
}
