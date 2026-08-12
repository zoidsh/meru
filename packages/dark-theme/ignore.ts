export type IgnorePropertyRule = {
  // Elements matching this selector (via element.matches) keep the listed properties
  // original instead of being themed. "border-color" covers all four sides.
  selector: string;
  properties: string[];
};

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
