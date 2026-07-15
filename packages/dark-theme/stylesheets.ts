// Stamped on every style element the engine injects so its own output — variable
// and state overrides, pseudo rules, caller css — is never walked or fingerprinted
// as page CSS, which would both defeat the collection cache and feed generated
// rules back into the next build.
export const INJECTED_STYLE_ATTRIBUTE = "data-dark-theme-style";

export const statePseudoRegex = /:(?:hover|active|focus(?:-within|-visible)?)\b/;

export const backgroundProperties = new Set([
  "background",
  "background-color",
  "background-image",
  "box-shadow",
]);

export const foregroundProperties = new Set([
  "color",
  "fill",
  "stroke",
  "caret-color",
  "-webkit-text-fill-color",
  "text-decoration-color",
  "column-rule-color",
]);

export const borderProperties = new Set([
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

export type StateRuleCandidate = {
  selectorText: string;
  declarations: Array<{ property: string; value: string }>;
};

export type StylesheetCollection = {
  customPropertyNames: Set<string>;
  customPropertyFallbacks: Map<string, string>;
  stateRuleCandidates: StateRuleCandidate[];
};

const customPropertyReferenceRegex = /var\(\s*(--[\w-]+)\s*(?:,([^)]*))?\)/g;

function visitRules(rules: CSSRuleList, visit: (rule: CSSStyleRule) => void) {
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule) {
      visit(rule);
    } else if (rule instanceof CSSGroupingRule) {
      visitRules(rule.cssRules, visit);
    }
  }
}

function isInjectedStyleSheet(sheet: CSSStyleSheet) {
  return (
    sheet.ownerNode instanceof Element && sheet.ownerNode.hasAttribute(INJECTED_STYLE_ATTRIBUTE)
  );
}

// Walks every style rule in the document, descending into grouping rules (media,
// supports, scope). Cross-origin stylesheets throw on cssRules — the same CORS
// wall image analysis hits — so their rules are skipped.
function forEachStyleRule(ownerDocument: Document, visit: (rule: CSSStyleRule) => void) {
  for (const sheet of ownerDocument.styleSheets) {
    if (isInjectedStyleSheet(sheet)) {
      continue;
    }

    let rules: CSSRuleList;

    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }

    visitRules(rules, visit);
  }
}

function collectFromRule(rule: CSSStyleRule, collection: StylesheetCollection) {
  const { style } = rule;

  for (let index = 0; index < style.length; index++) {
    const property = style.item(index);

    if (property.startsWith("--")) {
      collection.customPropertyNames.add(property);
    }
  }

  for (const match of style.cssText.matchAll(customPropertyReferenceRegex)) {
    const name = match[1];

    if (!name) {
      continue;
    }

    collection.customPropertyNames.add(name);

    const fallback = match[2]?.trim();

    if (fallback && !collection.customPropertyFallbacks.has(name)) {
      collection.customPropertyFallbacks.set(name, fallback);
    }
  }

  if (!statePseudoRegex.test(rule.selectorText)) {
    return;
  }

  const declarations: StateRuleCandidate["declarations"] = [];

  for (let index = 0; index < style.length; index++) {
    const property = style.item(index);

    if (
      backgroundProperties.has(property) ||
      foregroundProperties.has(property) ||
      borderProperties.has(property)
    ) {
      declarations.push({ property, value: style.getPropertyValue(property) });
    }
  }

  if (declarations.length > 0) {
    collection.stateRuleCandidates.push({ selectorText: rule.selectorText, declarations });
  }
}

// A cheap proxy for "have the document's stylesheets changed": pages add or
// remove whole sheets (a <style> or <link> element) far more often than they
// rewrite rules inside an existing sheet via CSSOM, so the sheet count plus each
// sheet's top-level rule count catches the realistic invalidations.
function getStylesheetFingerprint(ownerDocument: Document): string {
  const counts: number[] = [];

  for (const sheet of ownerDocument.styleSheets) {
    if (isInjectedStyleSheet(sheet)) {
      continue;
    }

    try {
      counts.push(sheet.cssRules.length);
    } catch {
      counts.push(-1);
    }
  }

  return counts.join(",");
}

const collectionCache = new WeakMap<
  Document,
  { fingerprint: string; collection: StylesheetCollection }
>();

// The stylesheet-derived raw material for the variable and state overrides —
// custom property names/fallbacks and state-rule color declarations — is
// collected in a single walk and cached per document, so re-theming (a new
// compose window, a message navigation) doesn't re-iterate Gmail's tens of
// thousands of rules every time.
export function getStylesheetCollection(ownerDocument: Document): StylesheetCollection {
  const fingerprint = getStylesheetFingerprint(ownerDocument);
  const cached = collectionCache.get(ownerDocument);

  if (cached && cached.fingerprint === fingerprint) {
    return cached.collection;
  }

  const collection: StylesheetCollection = {
    customPropertyNames: new Set(),
    customPropertyFallbacks: new Map(),
    stateRuleCandidates: [],
  };

  forEachStyleRule(ownerDocument, (rule) => collectFromRule(rule, collection));

  collectionCache.set(ownerDocument, { fingerprint, collection });

  return collection;
}
