import { parseColorWithCache, type RGBA } from "./color";
import { modifyBackgroundColor } from "./modify-colors";
import type { Theme } from "./theme";

const CHAR_CODE_OPEN_PAREN = 40;
const CHAR_CODE_CLOSE_PAREN = 41;
const CHAR_CODE_COMMA = 44;
const CHAR_CODE_HASH = 35;
const CHAR_CODE_DASH = 45;
const CHAR_CODE_UNDERSCORE = 95;
const CHAR_CODE_0 = 48;
const CHAR_CODE_9 = 57;
const CHAR_CODE_LOWER_A = 97;
const CHAR_CODE_LOWER_B = 98;
const CHAR_CODE_LOWER_F = 102;
const CHAR_CODE_LOWER_G = 103;
const CHAR_CODE_LOWER_H = 104;
const CHAR_CODE_LOWER_L = 108;
const CHAR_CODE_LOWER_R = 114;
const CHAR_CODE_LOWER_S = 115;
const CHAR_CODE_LOWER_Z = 122;
const CHAR_CODE_UPPER_A = 65;
const CHAR_CODE_UPPER_Z = 90;
const LOWERCASE_BIT = 32;

function isHexDigitCharCode(charCode: number): boolean {
  const folded = charCode | LOWERCASE_BIT;

  return (
    (charCode >= CHAR_CODE_0 && charCode <= CHAR_CODE_9) ||
    (folded >= CHAR_CODE_LOWER_A && folded <= CHAR_CODE_LOWER_F)
  );
}

// The length of a case-insensitive `rgb(`/`rgba(`/`hsl(`/`hsla(` opener at the
// given position, or 0 when the position doesn't start one.
function colorFunctionStartLengthAt(value: string, index: number): number {
  const firstLetter = value.charCodeAt(index) | LOWERCASE_BIT;
  let cursor: number;

  if (firstLetter === CHAR_CODE_LOWER_R) {
    if (
      (value.charCodeAt(index + 1) | LOWERCASE_BIT) !== CHAR_CODE_LOWER_G ||
      (value.charCodeAt(index + 2) | LOWERCASE_BIT) !== CHAR_CODE_LOWER_B
    ) {
      return 0;
    }

    cursor = index + 3;
  } else if (firstLetter === CHAR_CODE_LOWER_H) {
    if (
      (value.charCodeAt(index + 1) | LOWERCASE_BIT) !== CHAR_CODE_LOWER_S ||
      (value.charCodeAt(index + 2) | LOWERCASE_BIT) !== CHAR_CODE_LOWER_L
    ) {
      return 0;
    }

    cursor = index + 3;
  } else {
    return 0;
  }

  if ((value.charCodeAt(cursor) | LOWERCASE_BIT) === CHAR_CODE_LOWER_A) {
    cursor++;
  }

  if (value.charCodeAt(cursor) === CHAR_CODE_OPEN_PAREN) {
    return cursor + 1 - index;
  }

  return 0;
}

// Replaces every color token in a CSS value (gradient stops, shadow colors, a
// shorthand's color) via `modify`, leaving non-color tokens (positions, widths,
// var() references) intact. `modify` may return null to leave a token untouched.
//
// Function tokens run to their balanced closing paren because they can nest
// further parens (`rgba(0, 0, 0, calc(0.5))`); an unbalanced token runs to the
// end of the value. Tokens containing `var()` can't be evaluated statically —
// canvas-based parsing silently returns a stale color for them — so they're
// always left untouched.
export function modifyColorTokens(value: string, modify: (rgb: RGBA) => string | null): string {
  let result = "";
  let copiedUpTo = 0;
  let index = 0;

  while (index < value.length) {
    const charCode = value.charCodeAt(index);
    let tokenEnd = 0;

    if (charCode === CHAR_CODE_HASH) {
      let hexEnd = index + 1;

      while (hexEnd < value.length && isHexDigitCharCode(value.charCodeAt(hexEnd))) {
        hexEnd++;
      }

      if (hexEnd > index + 1) {
        tokenEnd = hexEnd;
      }
    } else {
      const startLength = colorFunctionStartLengthAt(value, index);

      if (startLength > 0) {
        let parenDepth = 1;
        let cursor = index + startLength;

        while (cursor < value.length && parenDepth > 0) {
          const cursorCharCode = value.charCodeAt(cursor);

          if (cursorCharCode === CHAR_CODE_OPEN_PAREN) {
            parenDepth++;
          } else if (cursorCharCode === CHAR_CODE_CLOSE_PAREN) {
            parenDepth--;
          }

          cursor++;
        }

        tokenEnd = cursor;
      }
    }

    if (tokenEnd === 0) {
      index++;

      continue;
    }

    const token = value.slice(index, tokenEnd);
    const rgb = token.includes("var(") ? null : parseColorWithCache(token);

    result += value.slice(copiedUpTo, index);
    result += rgb ? (modify(rgb) ?? token) : token;

    copiedUpTo = tokenEnd;
    index = tokenEnd;
  }

  return result + value.slice(copiedUpTo);
}

// Remaps color tokens through the background color math — gradients and shadows
// both read as surfaces, so they share the background pole.
export function replaceColorTokens(value: string, theme: Theme): string {
  return modifyColorTokens(value, (rgb) => modifyBackgroundColor(rgb, theme));
}

function isWhitespaceCharCode(charCode: number): boolean {
  return charCode === 32 || (charCode >= 9 && charCode <= 13);
}

function isCustomPropertyNameCharCode(charCode: number): boolean {
  return (
    (charCode >= CHAR_CODE_0 && charCode <= CHAR_CODE_9) ||
    (charCode >= CHAR_CODE_LOWER_A && charCode <= CHAR_CODE_LOWER_Z) ||
    (charCode >= CHAR_CODE_UPPER_A && charCode <= CHAR_CODE_UPPER_Z) ||
    charCode === CHAR_CODE_DASH ||
    charCode === CHAR_CODE_UNDERSCORE
  );
}

// The position right after `var(` + whitespace + `--name` + whitespace, or -1
// when the position doesn't start a var() reference with a custom property name.
function varReferenceBodyStart(value: string, varStart: number): number {
  let cursor = varStart + 4;

  while (isWhitespaceCharCode(value.charCodeAt(cursor))) {
    cursor++;
  }

  if (
    value.charCodeAt(cursor) !== CHAR_CODE_DASH ||
    value.charCodeAt(cursor + 1) !== CHAR_CODE_DASH
  ) {
    return -1;
  }

  const nameStart = cursor + 2;
  cursor = nameStart;

  while (isCustomPropertyNameCharCode(value.charCodeAt(cursor))) {
    cursor++;
  }

  if (cursor === nameStart) {
    return -1;
  }

  while (isWhitespaceCharCode(value.charCodeAt(cursor))) {
    cursor++;
  }

  return cursor;
}

// Replaces every `var(--x, fallback)` with its fallback text, innermost-first
// (`var(--a, var(--b, #fff))` becomes `#fff`), so a value can be darkened
// without depending on what the page resolves the variable to at runtime —
// definitions set via inline styles or constructed stylesheets are invisible to
// any stylesheet walk. A `var(--x)` without a fallback is left intact.
export function substituteVarFallbacks(value: string): string {
  let substitutedValue = value;
  let searchFrom = 0;

  while (true) {
    const varStart = substitutedValue.indexOf("var(", searchFrom);

    if (varStart === -1) {
      return substitutedValue;
    }

    const bodyStart = varReferenceBodyStart(substitutedValue, varStart);

    if (bodyStart === -1) {
      searchFrom = varStart + 1;

      continue;
    }

    let scanIndex = bodyStart;
    let parenDepth = 1;
    let fallbackStart = -1;

    while (scanIndex < substitutedValue.length && parenDepth > 0) {
      const charCode = substitutedValue.charCodeAt(scanIndex);

      if (charCode === CHAR_CODE_OPEN_PAREN) {
        parenDepth++;
      } else if (charCode === CHAR_CODE_CLOSE_PAREN) {
        parenDepth--;
      } else if (charCode === CHAR_CODE_COMMA && parenDepth === 1 && fallbackStart === -1) {
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
      substitutedValue.slice(0, varStart) + fallback + substitutedValue.slice(scanIndex + 1);
    searchFrom = varStart;
  }
}
