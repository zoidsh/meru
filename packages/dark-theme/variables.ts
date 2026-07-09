import { parse } from "./color";
import { relativeLuminance } from "./contrast";
import { replaceColorTokens } from "./css-value";
import { forEachStyleRule } from "./stylesheets";
import type { Theme } from "./theme";

const customPropertyReferenceRegex = /var\(\s*(--[\w-]+)\s*(?:,([^)]*))?\)/g;
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
    const rgba = parse(token);

    return rgba != null && relativeLuminance(rgba) > LIGHT_LUMINANCE_THRESHOLD;
  });
};

function collectFromRule(rule: CSSStyleRule, names: Set<string>, fallbacks: Map<string, string>) {
  const { style } = rule;

  for (let index = 0; index < style.length; index++) {
    const property = style.item(index);

    if (property.startsWith("--")) {
      names.add(property);
    }
  }

  for (const match of style.cssText.matchAll(customPropertyReferenceRegex)) {
    const name = match[1];

    if (!name) {
      continue;
    }

    names.add(name);

    const fallback = match[2]?.trim();

    if (fallback && !fallbacks.has(name)) {
      fallbacks.set(name, fallback);
    }
  }
}

// Gmail's reading pane paints many surfaces via CSS custom properties (e.g.
// `background: var(--pkw-background, #fff)`); a getComputedStyle snapshot of a
// real element can't see the ones that only resolve in a state the walk never
// observes, so they leak light. Custom properties inherit, so redefining the
// light ones — darkened — scoped to [data-dark-theme] cascades the dark value
// into the whole themed subtree and stops at its boundary, without touching the
// natively-dark Gmail shell around it.
//
// Only same-origin stylesheets can be read (cross-origin sheets throw on
// cssRules, the same CORS wall image analysis hits), so properties declared only
// in cross-origin sheets are missed.
export function buildDarkVariableOverrides(root: HTMLElement, theme: Theme): string | null {
  const ownerDocument = root.ownerDocument;
  const view = ownerDocument.defaultView;

  if (!view) {
    return null;
  }

  const names = new Set<string>();
  const fallbacks = new Map<string, string>();

  forEachStyleRule(ownerDocument, (rule) => collectFromRule(rule, names, fallbacks));

  const rootStyle = view.getComputedStyle(root);
  const declarations: string[] = [];

  for (const name of names) {
    const resolvedValue = rootStyle.getPropertyValue(name).trim();
    const value = resolvedValue || fallbacks.get(name) || "";

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

  return `[data-dark-theme] {\n${declarations.join("\n")}\n}`;
}
