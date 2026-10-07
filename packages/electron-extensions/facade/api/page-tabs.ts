import {
  noTabError,
  RUNTIME_PROXY_PATHS,
  type RuntimeProxyWorkerGetTabResult,
  type RuntimeProxyWorkerQueryTabsResult,
} from "../../runtime-proxy/bridge-protocol";
import { postBridge } from "../lib/bridge";
import type { ChromeNamespace } from "../lib/chrome";
import { defineMember, readMember } from "../lib/fill";
import { createBridgedMethod } from "../lib/method";

/**
 * `chrome.tabs.query` and `chrome.tabs.get` for an extension page in the
 * worker's session, answered from main the way the worker's own are
 * (`runtime-proxy/worker-tabs.ts`).
 *
 * Chromium scopes both to the session the page is in, which holds no account's
 * tab, so a password manager's popup opened in one of the embedder's windows
 * sees only itself: Bitwarden's then lists every login under All items and
 * none under Autofill suggestions, the current tab being its own page. And its
 * popout, found by `tabs.query({url})` before `windows.remove(tab.windowId)`,
 * comes back with a `windowId` that names no window `remove` knows, so the
 * popout never closes itself.
 *
 * Only for an extension that opens windows (`OPENS_EXTENSION_WINDOWS_GLOBAL`):
 * every other keeps Electron's own answers, which are what it has always had.
 */
export function proxyPageTabs(extensionApi: ChromeNamespace) {
  const tabs = readMember(extensionApi, "tabs") as ChromeNamespace | undefined;

  if (!tabs) {
    return;
  }

  defineMember(
    tabs,
    "query",
    createBridgedMethod(async ([queryInfo]) => {
      try {
        const response = await postBridge(RUNTIME_PROXY_PATHS.workerQueryTabs, { queryInfo });

        if (!response.ok) {
          return [];
        }

        return ((await response.json()) as RuntimeProxyWorkerQueryTabsResult).tabs ?? [];
      } catch {
        // A query has no `lastError` for "no tabs" in Chrome, so a bridge that
        // refused or went away answers the way a browser showing nothing does
        return [];
      }
    }),
  );

  defineMember(
    tabs,
    "get",
    createBridgedMethod(async ([tabId]) => {
      // An unreachable bridge reads as the tab being gone, Chrome's own error
      const result = (await postBridge(RUNTIME_PROXY_PATHS.workerGetTab, { tabId })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null)) as RuntimeProxyWorkerGetTabResult | null;

      if (!result) {
        throw new Error(noTabError(tabId));
      }

      if (result.status !== "tab") {
        throw new Error(result.error);
      }

      return result.tab;
    }),
  );
}
