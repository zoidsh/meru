import { parseColorWithCache } from "./color";
import { relativeLuminance } from "./contrast";
import { replaceColorTokens } from "./css-value";
import { getStylesheetCollection } from "./stylesheets";
import type { Theme } from "./theme";

const colorTokenRegex = /rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]+/gi;

// A value is worth darkening only if it reads as a light surface on the dark
// theme; medium and dark tokens are either already fine or handled by the
// element walk (which sets real elements' colors inline).
const LIGHT_LUMINANCE_THRESHOLD = 0.5;

const hasLightColorToken = (value: string) => {
  const tokens = value.match(colorTokenRegex);

  if (!tokens) {
    return false;
  }

  return tokens.some((token) => {
    const rgba = parseColorWithCache(token);

    return rgba != null && relativeLuminance(rgba) > LIGHT_LUMINANCE_THRESHOLD;
  });
};

// Gmail's reading pane paints many surfaces via CSS custom properties (e.g.
// `background: var(--pkw-background, #fff)`); a getComputedStyle snapshot of a
// real element can't see the ones that only resolve in a state the walk never
// observes, so they leak light. Custom properties inherit, so redefining the
// light ones — darkened — on the themed root cascades the dark value into the
// whole subtree and stops at its boundary, without touching the natively-dark
// Gmail shell around it.
//
// Only same-origin stylesheets can be read (cross-origin sheets throw on
// cssRules, the same CORS wall image analysis hits), so properties declared only
// in cross-origin sheets are missed.
export function buildDarkVariableOverrides(
  root: HTMLElement,
  theme: Theme,
  scopeSelector: string,
): string | null {
  const ownerDocument = root.ownerDocument;
  const view = ownerDocument.defaultView;

  if (!view) {
    return null;
  }

  const { customPropertyNames, customPropertyFallbacks } = getStylesheetCollection(ownerDocument);

  const rootStyle = view.getComputedStyle(root);
  const declarations: string[] = [];

  for (const name of customPropertyNames) {
    const resolvedValue = rootStyle.getPropertyValue(name).trim();
    const value = resolvedValue || customPropertyFallbacks.get(name) || "";

    if (!value || !hasLightColorToken(value)) {
      continue;
    }

    const darkenedValue = replaceColorTokens(value, theme);

    if (darkenedValue === value) {
      continue;
    }

    declarations.push(`  ${name}: ${darkenedValue} !important;`);
  }

  if (declarations.length === 0) {
    return null;
  }

  // Declared once on the themed root and inherited from there — applying to
  // every themed element instead (matching all of them with an attribute
  // selector) makes each style recalc pay for the whole set per element.
  return `${scopeSelector} {\n${declarations.join("\n")}\n}`;
}
