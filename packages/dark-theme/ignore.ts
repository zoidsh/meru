export type IgnorePropertyRule = {
  // Elements matching this selector (via element.matches) keep the listed properties
  // original instead of being themed. "border-color" covers all four sides.
  selector: string;
  properties: string[];
};

/**
 * The attributes named by `ignore` selectors, which the observer watches on top of
 * the ones it watches for state styles: a page can turn an element into something
 * `ignore` covers after it was themed — Gmail stamps `contenteditable` on a compose
 * body it has already inserted — and the engine has to look again when it does.
 *
 * `class` is watched anyway, and an id never changes, so only attribute selectors
 * are read.
 */
export function collectIgnoreAttributeNames(selectors: Iterable<string>) {
  const attributeNames = new Set<string>();

  for (const selector of selectors) {
    for (const [, attributeName] of selector.matchAll(/\[\s*([a-zA-Z][\w:.-]*)/g)) {
      if (attributeName) {
        attributeNames.add(attributeName);
      }
    }
  }

  return [...attributeNames];
}

// Whether an ignore rule's property list covers a property the engine is about to set.
export function coversProperty(properties: string[], property: string) {
  if (properties.includes(property)) {
    return true;
  }

  if (property.startsWith("border-") && property.endsWith("-color")) {
    return properties.includes("border-color");
  }

  return false;
}
