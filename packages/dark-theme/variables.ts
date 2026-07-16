import { parseColorWithCache } from "./color";
import { relativeLuminance } from "./contrast";
import { replaceColorTokens } from "./css-value";
import { getStylesheetCollection, type StylesheetCollection } from "./stylesheets";
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

  const stylesheetCollection = getStylesheetCollection(ownerDocument);
  const { customPropertyNames, customPropertyFallbacks } = stylesheetCollection;

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

  const scopedRulesText = getScopedDeclarationRules(stylesheetCollection, theme);

  const blocks: string[] = [];

  // Declared once on the themed root and inherited from there — applying to
  // every themed element instead (matching all of them with an attribute
  // selector) makes each style recalc pay for the whole set per element. A page
  // rule redefining one of these on an element inside the subtree beats
  // inheritance, but those definitions are exactly what the scoped per-selector
  // overrides below darken.
  if (declarations.length > 0) {
    blocks.push(`${scopeSelector} {\n${declarations.join("\n")}\n}`);
  }

  if (scopedRulesText) {
    blocks.push(`@scope (${scopeSelector}) {\n${scopedRulesText}\n}`);
  }

  if (blocks.length === 0) {
    return null;
  }

  return blocks.join("\n");
}

const scopedDeclarationRulesCache = new WeakMap<
  StylesheetCollection,
  { themeFingerprint: string; scopedRulesText: string | null }
>();

const getThemeFingerprint = (theme: Theme) =>
  `${theme.mode};${theme.brightness};${theme.contrast};${theme.grayscale};${theme.sepia};${theme.backgroundColor};${theme.textColor}`;

// Resolving at the root only sees properties inherited from above it. Pages
// also (re)define light palettes on wrappers *inside* the themed subtree —
// Gmail's GM3 sys colors live on theme-wrapper classes — so each declaring rule
// additionally gets a darkened copy under its own selector, scoped by the caller
// to the themed root. `!important` beats the page's normal declaration on the
// same element, and descendants inherit the dark value. The rules depend only on
// the collection and the theme, so re-theming reuses the cached text.
function getScopedDeclarationRules(collection: StylesheetCollection, theme: Theme) {
  const themeFingerprint = getThemeFingerprint(theme);
  const cached = scopedDeclarationRulesCache.get(collection);

  if (cached && cached.themeFingerprint === themeFingerprint) {
    return cached.scopedRulesText;
  }

  const scopedDeclarationsBySelector = new Map<string, string[]>();
  const seenScopedDeclarations = new Set<string>();

  for (const { selectorText, name, value } of collection.customPropertyDeclarations) {
    if (!hasLightColorToken(value)) {
      continue;
    }

    const darkenedValue = replaceColorTokens(value, theme);

    if (darkenedValue === value) {
      continue;
    }

    const declarationText = `${name}: ${darkenedValue} !important;`;
    const scopedDeclarationKey = `${selectorText} ${declarationText}`;

    if (seenScopedDeclarations.has(scopedDeclarationKey)) {
      continue;
    }

    seenScopedDeclarations.add(scopedDeclarationKey);

    const selectorDeclarations = scopedDeclarationsBySelector.get(selectorText);

    if (selectorDeclarations) {
      selectorDeclarations.push(declarationText);
    } else {
      scopedDeclarationsBySelector.set(selectorText, [declarationText]);
    }
  }

  let scopedRulesText: string | null = null;

  if (scopedDeclarationsBySelector.size > 0) {
    scopedRulesText = [...scopedDeclarationsBySelector]
      .map(
        ([selectorText, selectorDeclarations]) =>
          `${selectorText} { ${selectorDeclarations.join(" ")} }`,
      )
      .join("\n");
  }

  scopedDeclarationRulesCache.set(collection, { themeFingerprint, scopedRulesText });

  return scopedRulesText;
}
