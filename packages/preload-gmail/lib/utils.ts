export function createElementAttributeFromPreloadArgument(preloadArgument: string) {
  return preloadArgument.replace("--", "data-");
}

export function createNotMatchingAttributeSelector(selector: string, attribute: string) {
  return `${selector}:not([${attribute}])`;
}
