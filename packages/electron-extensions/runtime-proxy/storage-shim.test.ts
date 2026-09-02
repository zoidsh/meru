import { afterEach, describe, expect, test } from "bun:test";
import type { ChromeNamespace } from "../facade/lib/chrome";
import { RUNTIME_PROXY_PATHS, type RuntimeProxyStorageCallRequest } from "./bridge-protocol";
import { STORAGE_UNAVAILABLE_ERROR, type RuntimeProxyStorageResult } from "./storage-protocol";
import { installRuntimeProxyStorageShim } from "./storage-shim";

const EXTENSION_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

const SENDER_REPORT = { url: "https://accounts.google.com/", isTopFrame: true };

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

type RecordedCall = RuntimeProxyStorageCallRequest & { pathName: string };

async function waitFor(condition: () => boolean, what: string) {
  const deadline = Date.now() + 1000;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${what}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

/** Answers every storage call, recording what the shim asked for. */
function stubFetch(
  respond: (call: RecordedCall) => RuntimeProxyStorageResult | Promise<RuntimeProxyStorageResult>,
) {
  const calls: RecordedCall[] = [];

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as RuntimeProxyStorageCallRequest;

    const { pathname: pathName } = new URL(url);

    const recorded = { ...body, pathName };

    calls.push(recorded);

    return Response.json(await respond(recorded));
  }) as unknown as typeof fetch;

  return calls;
}

/**
 * A `chrome` whose storage areas carry only what Electron would put there, so
 * that what the shim shadows and what it leaves alone are both observable.
 */
function createShimmedApi(
  areas: Record<string, Record<string, unknown>> = {
    local: { get: () => {}, set: () => {}, remove: () => {}, clear: () => {} },
  },
) {
  const onChanged = { addListener: () => {} };

  const storage: ChromeNamespace = { onChanged };

  for (const [areaName, members] of Object.entries(areas)) {
    storage[areaName] = { onChanged: { addListener: () => {} }, ...members };
  }

  const runtime: ChromeNamespace = { id: EXTENSION_ID };

  const extensionApi: ChromeNamespace = { runtime, storage };

  installRuntimeProxyStorageShim(extensionApi, { getSenderReport: () => SENDER_REPORT });

  return { extensionApi, runtime, storage, onChanged };
}

type AreaMethod = (...callArguments: unknown[]) => Promise<unknown> | undefined;

describe("installRuntimeProxyStorageShim", () => {
  test("relays a call and answers the promise form with the worker's value", async () => {
    const calls = stubFetch(() => ({ status: "ok", value: { unlocked: true } }));

    const { storage } = createShimmedApi();

    const area = storage.local as ChromeNamespace;

    const value = await (area.get as AreaMethod)("unlocked");

    expect(value).toEqual({ unlocked: true });

    expect(calls).toEqual([
      {
        pathName: RUNTIME_PROXY_PATHS.storageCall,
        call: { area: "local", method: "get", arguments: ["unlocked"] },
        sender: SENDER_REPORT,
      },
    ]);
  });

  test("answers the callback form and sets lastError for its duration", async () => {
    stubFetch(() => ({ status: "error", message: "Access denied" }));

    const { storage, runtime } = createShimmedApi();

    const area = storage.local as ChromeNamespace;

    let seenError: string | undefined;

    let callbackValue: unknown = "untouched";

    const returned = (area.get as AreaMethod)("unlocked", (value?: unknown) => {
      callbackValue = value;

      seenError = (runtime.lastError as { message?: string } | undefined)?.message;
    });

    // Chrome's callback form answers nothing synchronously
    expect(returned).toBeUndefined();

    await waitFor(() => seenError !== undefined, "the callback");

    expect(seenError).toBe("Access denied");

    expect(callbackValue).toBeUndefined();

    // And `lastError` is gone again once the callback has run
    expect(runtime.lastError).toBeUndefined();
  });

  test("shadows only the methods Electron already implements", () => {
    const { storage } = createShimmedApi({
      local: { get: () => {}, set: () => {} },
    });

    const area = storage.local as ChromeNamespace;

    expect(typeof area.get).toBe("function");

    expect(typeof area.set).toBe("function");

    // An extension feature-detects these, and a method the worker's own store
    // has no implementation of must not appear merely because it is proxied
    expect(area.getKeys).toBeUndefined();

    expect(area.setAccessLevel).toBeUndefined();
  });

  test("leaves the areas' other members, and both onChanged events, exactly as they were", () => {
    const quota = 10_485_760;

    const { storage, onChanged } = createShimmedApi({
      local: { get: () => {}, QUOTA_BYTES: quota },
    });

    const area = storage.local as ChromeNamespace;

    // The constants an extension reads at boot stay where Chrome put them,
    // because the methods are replaced on the area rather than the area being
    // swapped for one of the proxy's own
    expect(area.QUOTA_BYTES).toBe(quota);

    // `onChanged` is left native and so never fires in this session, which is
    // no events rather than wrong ones until the worker-to-page channel lands
    expect(storage.onChanged).toBe(onChanged);

    expect(typeof (area.onChanged as ChromeNamespace).addListener).toBe("function");
  });

  test("shadows every area the session has, and nothing it does not", async () => {
    const calls = stubFetch(() => ({ status: "ok" }));

    const { storage } = createShimmedApi({
      local: { get: () => {} },
      session: { get: () => {} },
      sync: { get: () => {} },
      managed: { get: () => {} },
    });

    for (const areaName of ["local", "session", "sync", "managed"]) {
      await ((storage[areaName] as ChromeNamespace).get as AreaMethod)();
    }

    expect(calls.map((call) => call.call.area)).toEqual(["local", "session", "sync", "managed"]);
  });

  test("orders an area's calls, so a read observes the write written before it", async () => {
    const order: string[] = [];

    let releaseWrite = () => {};

    const writeReached = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });

    stubFetch(async (call) => {
      order.push(`start:${call.call.method}`);

      if (call.call.method === "set") {
        await writeReached;
      }

      order.push(`end:${call.call.method}`);

      return { status: "ok" };
    });

    const { storage } = createShimmedApi({ local: { get: () => {}, set: () => {} } });

    const area = storage.local as ChromeNamespace;

    const write = (area.set as AreaMethod)({ unlocked: true });

    const read = (area.get as AreaMethod)("unlocked");

    await waitFor(() => order.length > 0, "the write to be sent");

    // The read must not even have been sent while the write is outstanding
    expect(order).toEqual(["start:set"]);

    releaseWrite();

    await write;

    await read;

    expect(order).toEqual(["start:set", "end:set", "start:get", "end:get"]);
  });

  test("a failed call does not wedge the area behind it", async () => {
    let shouldFail = true;

    stubFetch(() =>
      shouldFail ? { status: "error", message: "boom" } : { status: "ok", value: "after" },
    );

    const { storage } = createShimmedApi();

    const area = storage.local as ChromeNamespace;

    await expect((area.get as AreaMethod)("first")).rejects.toThrow("boom");

    shouldFail = false;

    expect(await (area.get as AreaMethod)("second")).toBe("after");
  });

  test("an unreachable bridge reads as a store this context cannot reach", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("no bridge"))) as unknown as typeof fetch;

    const { storage } = createShimmedApi();

    await expect(((storage.local as ChromeNamespace).get as AreaMethod)()).rejects.toThrow(
      STORAGE_UNAVAILABLE_ERROR,
    );
  });

  test("a value the bridge cannot carry fails as the caller's own error", async () => {
    const calls = stubFetch(() => ({ status: "ok" }));

    const { storage } = createShimmedApi({ local: { set: () => {} } });

    const circular: Record<string, unknown> = {};

    circular.self = circular;

    await expect(
      ((storage.local as ChromeNamespace).set as AreaMethod)(circular),
    ).rejects.toThrow();

    // Nothing was sent, so the failure is the value's rather than the store's
    expect(calls).toEqual([]);
  });

  test("a second install in the same isolated world changes nothing", async () => {
    const calls = stubFetch(() => ({ status: "ok", value: "once" }));

    const { extensionApi, storage } = createShimmedApi();

    const area = storage.local as ChromeNamespace;

    const shadowedGet = area.get;

    installRuntimeProxyStorageShim(extensionApi, { getSenderReport: () => SENDER_REPORT });

    // The same function, so one chain still orders the area's calls
    expect(area.get).toBe(shadowedGet);

    expect(await (area.get as AreaMethod)("unlocked")).toBe("once");

    expect(calls).toHaveLength(1);
  });

  test("an extension API without storage is left alone", () => {
    const extensionApi: ChromeNamespace = { runtime: { id: EXTENSION_ID } };

    expect(() => {
      installRuntimeProxyStorageShim(extensionApi);
    }).not.toThrow();

    expect(extensionApi.storage).toBeUndefined();
  });
});
