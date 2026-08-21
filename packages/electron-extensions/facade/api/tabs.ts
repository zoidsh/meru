import type { ChromeNamespace } from "../lib/chrome";

/**
 * Electron implements the tabs namespace itself, minus the constants
 * extensions compare ids and call rates against.
 */
export function createTabs(): ChromeNamespace {
  return {
    MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND: 2,
    SPLIT_VIEW_ID_NONE: -1,
    TAB_ID_NONE: -1,
    TAB_INDEX_NONE: -1,
  };
}
