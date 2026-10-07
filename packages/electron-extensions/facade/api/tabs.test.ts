import { afterEach, describe, expect, test } from "bun:test";
import { RUNTIME_PROXY_PATHS, type RuntimeProxyTab } from "../../runtime-proxy/bridge-protocol";
import { createTabs } from "./tabs";

const contextGlobals = globalThis as unknown as { window?: unknown; fetch: typeof fetch };

const originalFetch = contextGlobals.fetch;

afterEach(() => {
  contextGlobals.fetch = originalFetch;

  delete contextGlobals.window;
});

const HOST_TAB = { id: 7, url: "https://accounts.google.com/", windowId: 1 } as RuntimeProxyTab;

function installFakeBridge(answer: unknown, { status = 200 } = {}) {
  const paths: string[] = [];

  contextGlobals.fetch = (async (url: string) => {
    paths.push(new URL(url).pathname);

    return status === 200 ? Response.json(answer) : new Response(null, { status });
  }) as unknown as typeof fetch;

  return paths;
}

/** A frame inside another page, whose `top` is that page's window. */
function installEmbeddedFrame() {
  contextGlobals.window = { top: {} };
}

/** A top-level page, its own `top`. */
function installTopLevelPage() {
  const pageWindow: { top?: unknown } = {};

  pageWindow.top = pageWindow;

  contextGlobals.window = pageWindow;
}

function getCurrent(...callArguments: unknown[]) {
  return (createTabs().getCurrent as (...args: unknown[]) => Promise<unknown>)(...callArguments);
}

describe("tabs.getCurrent", () => {
  test("answers the host tab in an extension frame embedded in a page", async () => {
    installEmbeddedFrame();

    const paths = installFakeBridge({ tab: HOST_TAB });

    expect(await getCurrent()).toEqual(HOST_TAB);

    expect(paths).toEqual([RUNTIME_PROXY_PATHS.currentTab]);
  });

  test("answers it in callback form too", async () => {
    installEmbeddedFrame();

    installFakeBridge({ tab: HOST_TAB });

    const answered = await new Promise((resolve) => {
      expect(getCurrent(resolve)).toBeUndefined();
    });

    expect(answered).toEqual(HOST_TAB);
  });

  test("answers undefined in a top-level page and in a worker, without asking", async () => {
    const paths = installFakeBridge({ tab: HOST_TAB });

    expect(await getCurrent()).toBeUndefined();

    installTopLevelPage();

    expect(await getCurrent()).toBeUndefined();

    expect(paths).toEqual([]);
  });

  test("answers undefined in a frame main names no tab for, or cannot answer", async () => {
    installEmbeddedFrame();

    installFakeBridge({ tab: null });

    expect(await getCurrent()).toBeUndefined();

    installFakeBridge(null, { status: 404 });

    expect(await getCurrent()).toBeUndefined();
  });
});
