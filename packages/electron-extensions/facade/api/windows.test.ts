import { afterEach, describe, expect, test } from "bun:test";
import { WINDOWS_PATHS, type WindowsWindow } from "../../windows/bridge-protocol";
import { callInCallbackForm } from "../lib/callback-form";
import type { ChromeNamespace } from "../lib/chrome";
import { createWindows } from "./windows";

type BridgeRequest = { path: string; body: Record<string, unknown> };

const extensionGlobals = globalThis as unknown as {
  chrome?: ChromeNamespace;
  document?: unknown;
  fetch: typeof fetch;
};

const originalFetch = extensionGlobals.fetch;

afterEach(() => {
  extensionGlobals.fetch = originalFetch;

  delete extensionGlobals.chrome;

  delete extensionGlobals.document;
});

/** The `runtime` a callback-form caller reads `lastError` from. */
function installRuntime() {
  extensionGlobals.chrome = { runtime: {} };

  return extensionGlobals.chrome.runtime as ChromeNamespace;
}

/** What a context that is inside a window has and a service worker does not. */
function installDocument() {
  extensionGlobals.document = {};
}

const OPENED_WINDOW: WindowsWindow = {
  id: 2,
  focused: true,
  incognito: false,
  alwaysOnTop: false,
  state: "normal",
  type: "popup",
  top: 40,
  left: 60,
  width: 380,
  height: 630,
  tabs: [],
};

/** The main process's end of it (`windows/windows.ts`), answer by answer. */
function installFakeBridge(answers: Record<string, unknown> = {}) {
  const requests: BridgeRequest[] = [];

  let refusalStatus: number | undefined;

  let isUnreachable = false;

  extensionGlobals.fetch = (async (url: string, init: RequestInit) => {
    const { pathname: path } = new URL(url);

    requests.push({ path, body: JSON.parse(init.body as string) as Record<string, unknown> });

    if (isUnreachable) {
      throw new Error("the bridge is not there");
    }

    if (refusalStatus !== undefined) {
      return new Response(null, { status: refusalStatus });
    }

    return Response.json(answers[path] ?? null);
  }) as unknown as typeof fetch;

  return {
    requests,
    refuse: (status: number) => {
      refusalStatus = status;
    },
    breakBridge: () => {
      isUnreachable = true;
    },
  };
}

function namespaceMethod(namespace: ChromeNamespace, name: string) {
  return namespace[name] as (...callArguments: unknown[]) => Promise<unknown>;
}

/** The id the facade answers for every window the embedder did not open. */
const FAKE_WINDOW_ID = 1;

const POPOUT_CREATE_DATA = {
  url: "popup/index.html?uilocation=popout",
  type: "popup",
  focused: true,
  width: 380,
  height: 630,
};

describe("createWindows", () => {
  test("answers create with the window the main process opened", async () => {
    const bridge = installFakeBridge({ [WINDOWS_PATHS.create]: { window: OPENED_WINDOW } });

    const created = await namespaceMethod(createWindows(), "create")(POPOUT_CREATE_DATA);

    expect(created).toEqual(OPENED_WINDOW);

    expect(bridge.requests).toEqual([
      { path: WINDOWS_PATHS.create, body: { createData: POPOUT_CREATE_DATA } },
    ]);
  });

  /*
   * The form Bitwarden calls every one of these in, and the one a
   * `webextension-polyfill`-shaped wrapper over `chrome` uses.
   */
  test("answers create in callback form", async () => {
    installFakeBridge({ [WINDOWS_PATHS.create]: { window: OPENED_WINDOW } });

    const runtime = installRuntime();

    const { returned, answered } = callInCallbackForm(
      runtime,
      namespaceMethod(createWindows(), "create"),
      POPOUT_CREATE_DATA,
    );

    expect(returned).toBeUndefined();

    expect(await answered).toEqual(OPENED_WINDOW);
  });

  test("fails create for a URL the main process refuses, with lastError in callback form", async () => {
    const refusal = "Only the extension's own pages can be opened in a window.";

    installFakeBridge({ [WINDOWS_PATHS.create]: { window: null, error: refusal } });

    const runtime = installRuntime();

    const windows = createWindows();

    await expect(
      namespaceMethod(windows, "create")({ url: "https://example.com/" }),
    ).rejects.toThrow(refusal);

    const { answered } = callInCallbackForm(runtime, namespaceMethod(windows, "create"), {
      url: "https://example.com/",
    });

    await expect(answered).rejects.toThrow(refusal);

    // Chrome's `lastError` lasts for the callback that reads it and no longer
    expect(runtime.lastError).toBeUndefined();
  });

  /*
   * The behavior every extension the embedder has not opted in keeps: a window
   * that was never opened, answered with an id that is neither
   * `WINDOW_ID_NONE` nor `WINDOW_ID_CURRENT`, which is what the namespace has
   * always done.
   */
  test("answers create with the fake window when the embedder opened none", async () => {
    installFakeBridge({ [WINDOWS_PATHS.create]: { window: null } });

    expect(await namespaceMethod(createWindows(), "create")({ url: "popup.html" })).toMatchObject({
      id: FAKE_WINDOW_ID,
    });
  });

  test("answers create with the fake window when the bridge cannot be reached", async () => {
    const refusedBridge = installFakeBridge();

    refusedBridge.refuse(403);

    expect(await namespaceMethod(createWindows(), "create")({ url: "popup.html" })).toMatchObject({
      id: FAKE_WINDOW_ID,
    });

    const brokenBridge = installFakeBridge();

    brokenBridge.breakBridge();

    expect(await namespaceMethod(createWindows(), "create")({ url: "popup.html" })).toMatchObject({
      id: FAKE_WINDOW_ID,
    });
  });

  test("asks the main process to remove a window and answers nothing", async () => {
    const bridge = installFakeBridge();

    expect(await namespaceMethod(createWindows(), "remove")(OPENED_WINDOW.id)).toBeUndefined();

    expect(bridge.requests).toEqual([
      { path: WINDOWS_PATHS.remove, body: { windowId: OPENED_WINDOW.id } },
    ]);
  });

  test("answers a remove the bridge could not serve with nothing, as Chrome does", async () => {
    const bridge = installFakeBridge();

    bridge.breakBridge();

    const runtime = installRuntime();

    const { answered } = callInCallbackForm(
      runtime,
      namespaceMethod(createWindows(), "remove"),
      OPENED_WINDOW.id,
    );

    expect(await answered).toBeUndefined();
  });

  test("answers get with the window the main process holds under that id", async () => {
    const bridge = installFakeBridge({ [WINDOWS_PATHS.get]: { window: OPENED_WINDOW } });

    // The arguments Bitwarden's popout asks with, the query options included
    expect(
      await namespaceMethod(createWindows(), "get")(OPENED_WINDOW.id, { populate: true }),
    ).toEqual(OPENED_WINDOW);

    expect(bridge.requests).toEqual([
      { path: WINDOWS_PATHS.get, body: { windowId: OPENED_WINDOW.id } },
    ]);
  });

  test("answers get with the fake window for an id the main process does not hold", async () => {
    installFakeBridge({ [WINDOWS_PATHS.get]: { window: null } });

    expect(await namespaceMethod(createWindows(), "get")(FAKE_WINDOW_ID)).toMatchObject({
      id: FAKE_WINDOW_ID,
    });
  });

  /*
   * How a popout closes itself: `getCurrent` and then `remove` of the id it
   * answered, with no id of its own to ask by.
   */
  test("answers getCurrent from a page with the window the calling frame is in", async () => {
    installDocument();

    const bridge = installFakeBridge({ [WINDOWS_PATHS.get]: { window: OPENED_WINDOW } });

    expect(await namespaceMethod(createWindows(), "getCurrent")()).toEqual(OPENED_WINDOW);

    expect(bridge.requests).toEqual([{ path: WINDOWS_PATHS.get, body: {} }]);
  });

  /*
   * A service worker is in no window, and reading `getCurrent` at boot is what
   * an extension that was never opted in does — so it is answered where it
   * stands rather than over the bridge.
   */
  test("answers getCurrent in a worker without asking the main process", async () => {
    const bridge = installFakeBridge();

    expect(await namespaceMethod(createWindows(), "getCurrent")()).toMatchObject({
      id: FAKE_WINDOW_ID,
    });

    expect(bridge.requests).toEqual([]);
  });

  test("keeps the methods the embedder serves no windows for as they were", async () => {
    const bridge = installFakeBridge();

    const windows = createWindows();

    expect(await namespaceMethod(windows, "getLastFocused")()).toMatchObject({
      id: FAKE_WINDOW_ID,
    });

    expect(await namespaceMethod(windows, "getAll")()).toEqual([
      expect.objectContaining({ id: FAKE_WINDOW_ID }),
    ]);

    expect(await namespaceMethod(windows, "update")(FAKE_WINDOW_ID, {})).toMatchObject({
      id: FAKE_WINDOW_ID,
    });

    expect(bridge.requests).toEqual([]);
  });
});
