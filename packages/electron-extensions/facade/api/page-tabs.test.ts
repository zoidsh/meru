import { afterEach, describe, expect, test } from "bun:test";
import {
  noTabError,
  RUNTIME_PROXY_PATHS,
  type RuntimeProxyTab,
} from "../../runtime-proxy/bridge-protocol";
import { callInCallbackForm } from "../lib/callback-form";
import type { ChromeNamespace } from "../lib/chrome";
import { proxyPageTabs } from "./page-tabs";

type BridgeRequest = { path: string; body: Record<string, unknown> };

const contextGlobals = globalThis as unknown as { chrome?: ChromeNamespace; fetch: typeof fetch };

const originalFetch = contextGlobals.fetch;

afterEach(() => {
  contextGlobals.fetch = originalFetch;

  delete contextGlobals.chrome;
});

const ACCOUNT_TAB = { id: 7, url: "https://accounts.google.com/", windowId: 1 } as RuntimeProxyTab;

/** The main-process end (`runtime-proxy/worker-tabs.ts`), answer by answer. */
function installFakeBridge(answers: Record<string, unknown>, { status = 200 } = {}) {
  const requests: BridgeRequest[] = [];

  contextGlobals.fetch = (async (url: string, init: RequestInit) => {
    const { pathname: path } = new URL(url);

    requests.push({ path, body: JSON.parse(init.body as string) as Record<string, unknown> });

    return status === 200 ? Response.json(answers[path]) : new Response(null, { status });
  }) as unknown as typeof fetch;

  return requests;
}

/** A page's `chrome`, with Electron's own `tabs`, scoped to the page's session. */
function createPageChrome() {
  const nativeQuery = () => Promise.resolve([]);

  const chrome: ChromeNamespace = { runtime: {}, tabs: { query: nativeQuery, get: nativeQuery } };

  proxyPageTabs(chrome);

  // Where a callback-form failure reads the `runtime` to set `lastError` on
  contextGlobals.chrome = chrome;

  return {
    runtime: chrome.runtime as ChromeNamespace,
    tabs: chrome.tabs as {
      query: (...callArguments: unknown[]) => Promise<unknown>;
      get: (...callArguments: unknown[]) => Promise<unknown>;
    },
  };
}

describe("proxyPageTabs", () => {
  test("answers query from main, the account's tabs included", async () => {
    const requests = installFakeBridge({
      [RUNTIME_PROXY_PATHS.workerQueryTabs]: { tabs: [ACCOUNT_TAB] },
    });

    const { tabs } = createPageChrome();

    const queryInfo = { active: true, currentWindow: true };

    expect(await tabs.query(queryInfo)).toEqual([ACCOUNT_TAB]);

    expect(requests).toEqual([{ path: RUNTIME_PROXY_PATHS.workerQueryTabs, body: { queryInfo } }]);
  });

  /*
   * Bitwarden calls `tabs.query` in callback form throughout, and a query that
   * cannot be answered is a browser showing nothing rather than an error.
   */
  test("answers query in callback form, and with nothing when main refuses", async () => {
    installFakeBridge({}, { status: 403 });

    const { runtime, tabs } = createPageChrome();

    const { returned, answered } = callInCallbackForm(runtime, tabs.query, { url: "*://*/*" });

    expect(returned).toBeUndefined();

    expect(await answered).toEqual([]);
  });

  test("answers get from main", async () => {
    const requests = installFakeBridge({
      [RUNTIME_PROXY_PATHS.workerGetTab]: { status: "tab", tab: ACCOUNT_TAB },
    });

    const { tabs } = createPageChrome();

    expect(await tabs.get(7)).toEqual(ACCOUNT_TAB);

    expect(requests).toEqual([{ path: RUNTIME_PROXY_PATHS.workerGetTab, body: { tabId: 7 } }]);
  });

  test("fails get with Chrome's own error, as lastError in callback form", async () => {
    installFakeBridge({
      [RUNTIME_PROXY_PATHS.workerGetTab]: { status: "noTarget", error: noTabError(404) },
    });

    const { runtime, tabs } = createPageChrome();

    await expect(tabs.get(404)).rejects.toThrow(noTabError(404));

    const { answered } = callInCallbackForm(runtime, tabs.get, 404);

    await expect(answered).rejects.toThrow(noTabError(404));
  });

  test("fails get as a tab that is gone when main cannot be reached", async () => {
    installFakeBridge({}, { status: 503 });

    const { tabs } = createPageChrome();

    await expect(tabs.get(7)).rejects.toThrow(noTabError(7));
  });
});
