import type { ChromeNamespace } from "../lib/chrome";

/**
 * Electron implements the tabs namespace itself, minus the two constants
 * extensions compare ids against.
 */
export function createTabs(): ChromeNamespace {
  return {
    TAB_ID_NONE: -1,
    TAB_INDEX_NONE: -1,
  };
}
