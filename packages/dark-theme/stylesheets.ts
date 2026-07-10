function visitRules(rules: CSSRuleList, visit: (rule: CSSStyleRule) => void) {
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule) {
      visit(rule);
    } else if (rule instanceof CSSGroupingRule) {
      visitRules(rule.cssRules, visit);
    }
  }
}

// Walks every style rule in the document, descending into grouping rules (media,
// supports, scope). Cross-origin stylesheets throw on cssRules — the same CORS
// wall image analysis hits — so their rules are skipped.
export function forEachStyleRule(ownerDocument: Document, visit: (rule: CSSStyleRule) => void) {
  for (const sheet of ownerDocument.styleSheets) {
    let rules: CSSRuleList;

    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }

    visitRules(rules, visit);
  }
}
