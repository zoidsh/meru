import { parseColorWithCache } from "./color";
import { relativeLuminance } from "./contrast";
import { replaceColorTokens } from "./css-value";
import { getStylesheetCollection } from "./stylesheets";
import { getThemeValueKey, type Theme } from "./theme";

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

// Values recur across re-themes (the same Gmail custom properties resolve to
// the same strings on every message open), so the light-token check and
// darkening memoize per value string. Keyed by value rather than property name
// because a property can resolve differently per themed root. Bounded like the
// parse caches — dropping entries only costs recomputation.
const DARKENED_VALUE_CACHE_MAX_ENTRIES = 4096;
const darkenedValuesByThemeKey = new Map<string, Map<string, string | null>>();

const darkenLightValue = (value: string, theme: Theme) => {
  const themeValueKey = getThemeValueKey(theme);
  let darkenedValueCache = darkenedValuesByThemeKey.get(themeValueKey);

  if (!darkenedValueCache) {
    darkenedValueCache = new Map();
    darkenedValuesByThemeKey.set(themeValueKey, darkenedValueCache);
  }

  const cached = darkenedValueCache.get(value);

  if (cached !== undefined) {
    return cached;
  }

  let darkenedValue: string | null = null;

  if (hasLightColorToken(value)) {
    const replacedValue = replaceColorTokens(value, theme);

    if (replacedValue !== value) {
      darkenedValue = replacedValue;
    }
  }

  if (darkenedValueCache.size >= DARKENED_VALUE_CACHE_MAX_ENTRIES) {
    darkenedValueCache.clear();
  }

  darkenedValueCache.set(value, darkenedValue);

  return darkenedValue;
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

    if (!value) {
      continue;
    }

    const darkenedValue = darkenLightValue(value, theme);

    if (darkenedValue == null) {
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
