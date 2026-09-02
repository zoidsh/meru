import type { ChromeNamespace } from "./chrome";

/**
 * Reads through whatever Electron put in the way. A namespace Chromium declares
 * without shipping its module — `webRequest` is one — answers with a getter
 * that logs and gives back `undefined`, and nothing here should ride on that
 * staying an ordinary property.
 */
export function readMember(target: ChromeNamespace, name: string) {
  try {
    return target[name];
  } catch {
    return undefined;
  }
}

export function defineMember(target: ChromeNamespace, name: string, value: unknown) {
  try {
    Object.defineProperty(target, name, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch {
    target[name] = value;
  }
}

function isNamespace(value: unknown): value is ChromeNamespace {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Adds what `facade` has and `target` lacks, and never anything else: an API
 * Electron implements keeps the object it implemented, down to the individual
 * members of a namespace it ships half-finished.
 */
export function fillMissing(target: ChromeNamespace, facade: ChromeNamespace) {
  for (const [name, facadeValue] of Object.entries(facade)) {
    try {
      const nativeValue = readMember(target, name);

      if (nativeValue === undefined) {
        defineMember(target, name, facadeValue);

        continue;
      }

      if (isNamespace(nativeValue) && isNamespace(facadeValue)) {
        fillMissing(nativeValue, facadeValue);
      }
    } catch (error) {
      // What Chromium will not let us fill must not cost the extension the rest
      console.error(`[chrome-facade] could not fill ${name}`, error);
    }
  }
}
