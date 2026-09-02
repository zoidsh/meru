import { afterEach, describe, expect, test } from "bun:test";
import { deriveManifest } from "../derive/manifest";
import type { ChromeNamespace } from "../facade/lib/chrome";
import { RUNTIME_PROXY_PATHS } from "./bridge-protocol";
import { installShim } from "./install-shim";

const EXTENSION_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

const SENDER_REPORT = { url: "https://accounts.google.com/signin", isTopFrame: true };

const INSTALLED_GLOBAL = "__meruRuntimeProxyShimInstalled";

const originalFetch = globalThis.fetch;

const contextGlobals = globalThis as unknown as Record<string, unknown>;

const startedClients: { stop: () => void }[] = [];

afterEach(() => {
  globalThis.fetch = originalFetch;

  for (const client of startedClients.splice(0)) {
    client.stop();
  }

  delete contextGlobals[INSTALLED_GLOBAL];

  delete contextGlobals.chrome;

  delete contextGlobals.browser;
});

async function waitFor(condition: () => boolean, what: string) {
  const deadline = Date.now() + 1000;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${what}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

function stubBridge() {
  const parkedPaths: string[] = [];

  globalThis.fetch = (async (url: string) => {
    const { pathname: pathName } = new URL(url);

    parkedPaths.push(pathName);

    if (pathName === RUNTIME_PROXY_PATHS.pageStream) {
      return new Response(new ReadableStream<Uint8Array>({ start: () => undefined }), {
        status: 200,
      });
    }

    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;

  return {
    parksSoFar: () => parkedPaths.filter((path) => path === RUNTIME_PROXY_PATHS.pageStream).length,
  };
}

/** A context of the extension, the way Electron hands one to a script. */
function createContextGlobals() {
  const createNativeEvent = () => ({
    addListener: () => undefined,
    removeListener: () => undefined,
  });

  const runtime: ChromeNamespace = {
    id: EXTENSION_ID,
    sendMessage: () => undefined,
    connect: () => undefined,
    onMessage: createNativeEvent(),
    onConnect: createNativeEvent(),
  };

  contextGlobals.chrome = { runtime };

  return runtime;
}

function install() {
  const client = installShim({ getSenderReport: () => SENDER_REPORT, retryDelayMs: 5 });

  if (client) {
    startedClients.push(client);
  }

  return client;
}

describe("installShim", () => {
  test("installs once however often the bundle runs in one context", async () => {
    const stub = stubBridge();

    const runtime = createContextGlobals();

    expect(install()).toBeDefined();

    const shimmedSendMessage = runtime.sendMessage;

    const shimmedConnect = runtime.connect;

    await waitFor(() => stub.parksSoFar() === 1, "the page stream to park");

    // Twice more, which is what a page matching three of an extension's
    // content_scripts entries does: the derive prepends the shim to every one
    // of them and Chromium runs them all in the same isolated world
    expect(install()).toBeUndefined();

    expect(install()).toBeUndefined();

    // Nothing re-shadowed, so no shim wraps another shim
    expect(runtime.sendMessage).toBe(shimmedSendMessage);

    expect(runtime.connect).toBe(shimmedConnect);

    // And one stream, rather than three each evicting the last
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(stub.parksSoFar()).toBe(1);
  });

  test("a manifest's overlapping entries all carry the shim, which is why", () => {
    // The premise the guard exists for, held against the derive rather than
    // asserted in prose: every entry with scripts gets the shim prepended, so
    // a page matching two of them runs it twice in one isolated world
    const { manifest } = deriveManifest(
      {
        manifest_version: 3,
        name: "Overlapping",
        version: "1.0.0",
        content_scripts: [
          { matches: ["https://*/*"], js: ["autofill.js"], all_frames: true },
          { matches: ["<all_urls>"], js: ["menu.js"], all_frames: true },
        ],
      },
      {
        facadeFileName: "facade.js",
        serviceWorkerFileName: "worker.js",
        bridgeConnectSource: "meru-extension-bridge://*",
        sharedInstance: { role: "contentScriptOnly", shimFileName: "shim.js" },
      },
    );

    expect(manifest.content_scripts?.map((contentScript) => contentScript.js)).toEqual([
      ["shim.js", "autofill.js"],
      ["shim.js", "menu.js"],
    ]);
  });
});
