import {
  type RuntimeProxyCurrentTabResult,
  RUNTIME_PROXY_PATHS,
} from "../../runtime-proxy/bridge-protocol";
import { postBridge } from "../lib/bridge";
import type { ChromeNamespace } from "../lib/chrome";
import { createBridgedMethod } from "../lib/method";

/** Whether this context is a frame inside another page, the one kind that is in a tab. */
function isEmbeddedFrame() {
  const contextWindow = (globalThis as unknown as { window?: { top?: unknown } }).window;

  return contextWindow !== undefined && contextWindow.top !== contextWindow;
}

/**
 * Electron implements the tabs namespace itself, minus the constants
 * extensions compare ids and call rates against, and `getCurrent`.
 *
 * `getCurrent` answers `undefined` for every context that is not in a tab, as
 * Chrome does: the worker, and a top-level extension page — the toolbar popup
 * in Chrome, and here the windows `chrome.windows.create` opens. Those are
 * answered without asking. Bitwarden's popup asks as it boots, and without the
 * method the whole page fails on a TypeError.
 *
 * An extension frame embedded in a page is in that page's tab, which main
 * names (`runtime-proxy/worker-tabs.ts`); a bridge that cannot answer is read as
 * no tab, the answer the method gave before it asked.
 */
export function createTabs(): ChromeNamespace {
  return {
    MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND: 2,
    SPLIT_VIEW_ID_NONE: -1,
    TAB_ID_NONE: -1,
    TAB_INDEX_NONE: -1,
    getCurrent: createBridgedMethod(async () => {
      if (!isEmbeddedFrame()) {
        return undefined;
      }

      try {
        const response = await postBridge(RUNTIME_PROXY_PATHS.currentTab, {});

        if (!response.ok) {
          return undefined;
        }

        return ((await response.json()) as RuntimeProxyCurrentTabResult).tab ?? undefined;
      } catch {
        return undefined;
      }
    }),
  };
}
