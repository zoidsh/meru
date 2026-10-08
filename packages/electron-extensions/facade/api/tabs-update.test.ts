import { afterEach, describe, expect, test } from "bun:test";
import {
  noTabError,
  RUNTIME_PROXY_PATHS,
  type RuntimeProxyTab,
} from "../../runtime-proxy/bridge-protocol";
import { callInCallbackForm } from "../lib/callback-form";
import type { ChromeNamespace } from "../lib/chrome";
import { withLastError } from "../lib/last-error";
import { proxyTabsUpdate } from "./tabs-update";

type BridgeRequest = { path: string; body: Record<string, unknown> };

const contextGlobals = globalThis as unknown as { chrome?: ChromeNamespace; fetch: typeof fetch };

const originalFetch = contextGlobals.fetch;

afterEach(() => {
  contextGlobals.fetch = originalFetch;

  delete contextGlobals.chrome;
});

const ACCOUNT_TAB = { id: 7, url: "https://accounts.google.com/", active: true } as RuntimeProxyTab;

const POPOUT_TAB = { id: 9, url: "chrome-extension://id/popup/index.html" };

/** The main-process end (`runtime-proxy/worker-tabs.ts`), with one answer. */
function installFakeBridge(answer: unknown, { status = 200 } = {}) {
  const requests: BridgeRequest[] = [];

  contextGlobals.fetch = (async (url: string, init: RequestInit) => {
    const { pathname: path } = new URL(url);

    requests.push({ path, body: JSON.parse(init.body as string) as Record<string, unknown> });

    return status === 200 ? Response.json(answer) : new Response(null, { status });
  }) as unknown as typeof fetch;

  return requests;
}

/**
 * A worker's `chrome`, with Electron's own `tabs.update`, which knows only the
 * worker session's tabs and answers in callback form with `lastError` set for
 * any other.
 */
function createWorkerChrome() {
  const nativeCalls: unknown[][] = [];

  const runtime: ChromeNamespace = {};

  const nativeUpdate = (...callArguments: unknown[]) => {
    const callback = callArguments.pop() as (tab?: unknown) => void;

    nativeCalls.push(callArguments);

    queueMicrotask(() => {
      if (callArguments[0] === POPOUT_TAB.id) {
        callback(POPOUT_TAB);
      } else {
        withLastError(runtime, "No such tab", () => {
          callback();
        });
      }
    });
  };

  const chrome: ChromeNamespace = { runtime, tabs: { update: nativeUpdate } };

  proxyTabsUpdate(chrome);

  // Where a callback-form failure reads the `runtime` to set `lastError` on
  contextGlobals.chrome = chrome;

  return {
    runtime,
    nativeCalls,
    update: (chrome.tabs as { update: (...callArguments: unknown[]) => Promise<unknown> }).update,
  };
}

describe("proxyTabsUpdate", () => {
  test("answers an account's tab from main", async () => {
    const requests = installFakeBridge({ status: "tab", tab: ACCOUNT_TAB });

    const { update, nativeCalls } = createWorkerChrome();

    const updateProperties = { active: true, highlighted: true };

    expect(await update(7, updateProperties)).toEqual(ACCOUNT_TAB);

    expect(requests).toEqual([
      { path: RUNTIME_PROXY_PATHS.workerUpdateTab, body: { tabId: 7, updateProperties } },
    ]);

    expect(nativeCalls).toEqual([]);
  });

  test("answers in callback form, the way Bitwarden and 1Password's wrapper call it", async () => {
    installFakeBridge({ status: "tab", tab: ACCOUNT_TAB });

    const { runtime, update } = createWorkerChrome();

    const { returned, answered } = callInCallbackForm(runtime, update, 7, { active: true });

    expect(returned).toBeUndefined();

    expect(await answered).toEqual(ACCOUNT_TAB);
  });

  test("sends no id when the caller gave none, which is the current tab", async () => {
    const requests = installFakeBridge({ status: "tab", tab: ACCOUNT_TAB });

    const { update } = createWorkerChrome();

    await update({ active: true });

    expect(requests[0]?.body).toEqual({ updateProperties: { active: true } });
  });

  test("fails with main's error, as lastError in callback form", async () => {
    const error = "Cannot change the URL of tab with id: 7.";

    installFakeBridge({ status: "refused", error });

    const { runtime, update } = createWorkerChrome();

    await expect(update(7, { url: "https://example.com/" })).rejects.toThrow(error);

    const { answered } = callInCallbackForm(runtime, update, 7, { url: "https://example.com/" });

    await expect(answered).rejects.toThrow(error);

    installFakeBridge({ status: "noTarget", error: noTabError(404) });

    const { answered: noTab } = callInCallbackForm(runtime, update, 404, { active: true });

    await expect(noTab).rejects.toThrow(noTabError(404));
  });

  test("leaves a tab of the worker's own session to Electron", async () => {
    installFakeBridge({ status: "ownSession" });

    const { update, nativeCalls } = createWorkerChrome();

    expect(await update(POPOUT_TAB.id, { active: true })).toEqual(POPOUT_TAB);

    expect(nativeCalls).toEqual([[POPOUT_TAB.id, { active: true }]]);
  });

  test("leaves the call to Electron when main cannot be asked, Electron's error included", async () => {
    installFakeBridge(null, { status: 403 });

    const { runtime, update, nativeCalls } = createWorkerChrome();

    const { answered } = callInCallbackForm(runtime, update, 7, { active: true });

    await expect(answered).rejects.toThrow("No such tab");

    expect(nativeCalls).toEqual([[7, { active: true }]]);
  });
});
