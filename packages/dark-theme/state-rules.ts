import type { RGBA } from "./color";
import { modifyColorTokens } from "./css-value";
import { modifyBackgroundColor, modifyBorderColor, modifyForegroundColor } from "./modify-colors";
import { forEachStyleRule } from "./stylesheets";
import type { Theme } from "./theme";

const statePseudoRegex = /:(?:hover|active|focus(?:-within|-visible)?)\b/;

const backgroundProperties = new Set([
  "background",
  "background-color",
  "background-image",
  "box-shadow",
]);

const foregroundProperties = new Set([
  "color",
  "fill",
  "stroke",
  "caret-color",
  "-webkit-text-fill-color",
  "text-decoration-color",
  "column-rule-color",
]);

const borderProperties = new Set([
  "border",
  "border-color",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline",
  "outline-color",
]);

// Fully transparent tokens are left as-is so a rule whose only color is a default
// `background-color: transparent` longhand produces no override — otherwise every
// state rule in the document would emit a useless transparent declaration.
const keepTransparent = (modify: (rgb: RGBA) => string) => (rgb: RGBA) =>
  rgb.a === 0 ? null : modify(rgb);

const darkenDeclaration = (property: string, value: string, theme: Theme) => {
  if (backgroundProperties.has(property)) {
    return modifyColorTokens(
      value,
      keepTransparent((rgb) => modifyBackgroundColor(rgb, theme)),
    );
  }

  if (foregroundProperties.has(property)) {
    return modifyColorTokens(
      value,
      keepTransparent((rgb) => modifyForegroundColor(rgb, theme)),
    );
  }

  if (borderProperties.has(property)) {
    return modifyColorTokens(
      value,
      keepTransparent((rgb) => modifyBorderColor(rgb, theme)),
    );
  }

  return null;
};

// `:hover`/`:focus` styles live in author rules a getComputedStyle snapshot never
// sees (the state isn't active at theme time), so they leak light. This rewrites
// those rules' color-bearing declarations — darkened — keeping each selector
// verbatim and wrapping the whole set in `@scope (scopeSelector)` so they apply
// only inside the themed subtree, never the natively-dark Gmail shell around it.
//
// Only same-origin stylesheets can be read (cross-origin sheets throw on
// cssRules, the same CORS wall image analysis hits).
export function buildDarkStateOverrides(
  ownerDocument: Document,
  theme: Theme,
  scopeSelector: string,
): string | null {
  const seen = new Set<string>();
  const rules: string[] = [];

  forEachStyleRule(ownerDocument, (rule) => {
    if (!statePseudoRegex.test(rule.selectorText)) {
      return;
    }

    const declarations: string[] = [];
    const { style } = rule;

    for (let index = 0; index < style.length; index++) {
      const property = style.item(index);
      const value = style.getPropertyValue(property);
      const darkenedValue = darkenDeclaration(property, value, theme);

      if (darkenedValue != null && darkenedValue !== value) {
        declarations.push(`${property}: ${darkenedValue} !important`);
      }
    }

    if (declarations.length === 0) {
      return;
    }

    const generatedRule = `${rule.selectorText} { ${declarations.join("; ")}; }`;

    if (!seen.has(generatedRule)) {
      seen.add(generatedRule);
      rules.push(generatedRule);
    }
  });

  if (rules.length === 0) {
    return null;
  }

  return `@scope (${scopeSelector}) {\n${rules.join("\n")}\n}`;
}
