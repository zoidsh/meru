import type { ChromeNamespace } from "../lib/chrome";
import { createNoopMethod } from "../lib/method";

/**
 * Electron implements the tabs namespace itself, minus the constants
 * extensions compare ids and call rates against, and `getCurrent`.
 *
 * `getCurrent` answers `undefined`, which is Chrome's answer for every context
 * that is not a tab: the action popup, the worker, and here the windows
 * `chrome.windows.create` opens, which are pages with no tab around them.
 * Bitwarden's popup asks it as it boots, and without it the whole page fails
 * on a TypeError.
 */
export function createTabs(): ChromeNamespace {
  return {
    MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND: 2,
    SPLIT_VIEW_ID_NONE: -1,
    TAB_ID_NONE: -1,
    TAB_INDEX_NONE: -1,
    getCurrent: createNoopMethod(() => undefined),
  };
}
