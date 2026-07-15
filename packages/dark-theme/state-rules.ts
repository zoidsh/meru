import type { RGBA } from "./color";
import { modifyColorTokens } from "./css-value";
import { coversProperty, type IgnorePropertyRule } from "./ignore";
import { modifyBackgroundColor, modifyBorderColor, modifyForegroundColor } from "./modify-colors";
import {
  backgroundProperties,
  borderProperties,
  foregroundProperties,
  getStylesheetCollection,
} from "./stylesheets";
import type { Theme } from "./theme";

const statePseudoStripRegex = /:(?:hover|active|focus(?:-within|-visible)?)\b/g;

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
  root: HTMLElement,
  theme: Theme,
  scopeSelector: string,
  ignorePropertyRules: IgnorePropertyRule[],
): string | null {
  const seen = new Set<string>();
  const rules: string[] = [];

  // The ignore rules a state rule must respect: those whose selector matches an
  // element the rule (with its state pseudos stripped) actually targets. Matching
  // is scoped to the themed root — the generated rules are @scope-wrapped, so an
  // element outside the subtree can never be affected by them — and memoized per
  // selector, since the query is the expensive part.
  const applicableIgnoreRulesBySelector = new Map<string, IgnorePropertyRule[]>();

  const applicableIgnoreRules = (selectorText: string) => {
    const memoized = applicableIgnoreRulesBySelector.get(selectorText);

    if (memoized) {
      return memoized;
    }

    const baseSelector = selectorText.replace(statePseudoStripRegex, "").trim();
    let targetedElements: Element[] = [];

    if (baseSelector !== "") {
      try {
        targetedElements = [...root.querySelectorAll(baseSelector)];

        if (root.matches(baseSelector)) {
          targetedElements.push(root);
        }
      } catch {
        targetedElements = [];
      }
    }

    const ignoreRules = ignorePropertyRules.filter((ignoreRule) =>
      targetedElements.some((element) => element.matches(ignoreRule.selector)),
    );

    applicableIgnoreRulesBySelector.set(selectorText, ignoreRules);

    return ignoreRules;
  };

  for (const candidate of getStylesheetCollection(root.ownerDocument).stateRuleCandidates) {
    const darkenedDeclarations: Array<{ property: string; declarationText: string }> = [];

    for (const { property, value } of candidate.declarations) {
      const darkenedValue = darkenDeclaration(property, value, theme);

      if (darkenedValue != null && darkenedValue !== value) {
        darkenedDeclarations.push({
          property,
          declarationText: `${property}: ${darkenedValue} !important`,
        });
      }
    }

    if (darkenedDeclarations.length === 0) {
      continue;
    }

    // The live selector matching behind applicableIgnoreRules only runs when an
    // ignore rule actually covers one of the darkened properties — for the vast
    // majority of state rules none does, and the query can be skipped outright.
    const isCoveredByIgnoreRules = ignorePropertyRules.some((ignoreRule) =>
      darkenedDeclarations.some(({ property }) => coversProperty(ignoreRule.properties, property)),
    );

    let declarations = darkenedDeclarations;

    if (isCoveredByIgnoreRules) {
      const ignoreRules = applicableIgnoreRules(candidate.selectorText);

      declarations = darkenedDeclarations.filter(
        ({ property }) =>
          !ignoreRules.some((ignoreRule) => coversProperty(ignoreRule.properties, property)),
      );

      if (declarations.length === 0) {
        continue;
      }
    }

    const generatedRule = `${candidate.selectorText} { ${declarations
      .map(({ declarationText }) => declarationText)
      .join("; ")}; }`;

    if (!seen.has(generatedRule)) {
      seen.add(generatedRule);
      rules.push(generatedRule);
    }
  }

  if (rules.length === 0) {
    return null;
  }

  return `@scope (${scopeSelector}) {\n${rules.join("\n")}\n}`;
}
