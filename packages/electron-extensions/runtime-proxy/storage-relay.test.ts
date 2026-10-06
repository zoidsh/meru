import { afterEach, describe, expect, test } from "bun:test";
import type { ChromeEventListener, ChromeNamespace } from "../facade/lib/chrome";
import { RUNTIME_PROXY_PATHS } from "./bridge-protocol";
import {
  STORAGE_ACCESS_DENIED_ERROR,
  STORAGE_ACCESS_LEVEL_CONTEXT_ERROR,
  STORAGE_UNAVAILABLE_ERROR,
} from "./storage-protocol";
import { createStorageRelay } from "./storage-relay";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

type RecordedPost = { pathName: string; body: Record<string, unknown> };

async function waitFor(condition: () => boolean, what: string) {
  const deadline = Date.now() + 1000;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${what}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

function stubFetch() {
  const posts: RecordedPost[] = [];

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    posts.push({
      pathName: new URL(url).pathname,
      body: JSON.parse(init.body as string) as Record<string, unknown>,
    });

    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;

  return posts;
}

/**
 * A worker's `chrome`, answering the callback form the way Electron's native
 * storage does: the value through the callback, an error through
 * `runtime.lastError` read inside it.
 */
function createWorkerApi() {
  const store = new Map<string, unknown>();

  const runtime: ChromeNamespace = { id: "aeblfdkhhhdcdjpifhhbdiojplfjncoa" };

  const failures = new Map<string, string>();

  const answer = (method: string, value: unknown, callback: unknown) => {
    const failure = failures.get(method);

    if (typeof callback !== "function") {
      return;
    }

    if (failure === undefined) {
      (callback as (value?: unknown) => void)(value);

      return;
    }

    runtime.lastError = { message: failure };

    try {
      (callback as (value?: unknown) => void)(undefined);
    } finally {
      delete runtime.lastError;
    }
  };

  const accessLevelCalls: unknown[] = [];

  const local: ChromeNamespace = {
    get(keys: unknown, callback: unknown) {
      answer("get", { [String(keys)]: store.get(String(keys)) }, callback);
    },
    set(items: unknown, callback: unknown) {
      for (const [key, value] of Object.entries(items as Record<string, unknown>)) {
        store.set(key, value);
      }

      answer("set", undefined, callback);
    },
    setAccessLevel(options: unknown, callback: unknown) {
      accessLevelCalls.push(options);

      answer("setAccessLevel", undefined, callback);
    },
  };

  const sessionArea: ChromeNamespace = {
    get(keys: unknown, callback: unknown) {
      answer("session.get", { [String(keys)]: undefined }, callback);
    },
  };

  const changedListeners: ChromeEventListener[] = [];

  /**
   * Chromium's own event binding, receiver and all: `addListener` detached
   * from its event throws there, so it throws here. Without that the relay
   * could take a reference to it, and the throw would only ever be seen in
   * the end-to-end suite — as a service worker that never finished evaluating.
   */
  const changedEvent: ChromeNamespace = {
    addListener(this: unknown, listener: ChromeEventListener) {
      if (this !== changedEvent) {
        throw new TypeError("Illegal invocation");
      }

      changedListeners.push(listener);
    },
  };

  const storage: ChromeNamespace = {
    local,
    session: sessionArea,
    onChanged: changedEvent,
  };

  return {
    extensionApi: { runtime, storage } as ChromeNamespace,
    local,
    store,
    accessLevelCalls,
    changedListeners,
    /** Electron's own `chrome.storage.onChanged`, which names the area too. */
    fireChange: (changes: unknown, areaName: unknown) => {
      for (const listener of changedListeners) {
        listener(changes, areaName);
      }
    },
    failMethod: (method: string, message: string) => {
      failures.set(method, message);
    },
  };
}

describe("createStorageRelay", () => {
  test("answers a relayed call against the worker's own store", async () => {
    const worker = createWorkerApi();

    const relay = createStorageRelay([worker.extensionApi]);

    expect(
      await relay.run({ area: "local", method: "set", arguments: [{ unlocked: true }] }, true),
    ).toEqual({ status: "ok", value: undefined });

    expect(worker.store.get("unlocked")).toBe(true);

    expect(
      await relay.run({ area: "local", method: "get", arguments: ["unlocked"] }, true),
    ).toEqual({
      status: "ok",
      value: { unlocked: true },
    });
  });

  test("carries the native call's own error text back, rather than a paraphrase", async () => {
    const worker = createWorkerApi();

    worker.failMethod("set", "QUOTA_BYTES quota exceeded");

    const relay = createStorageRelay([worker.extensionApi]);

    expect(
      await relay.run({ area: "local", method: "set", arguments: [{ big: "x" }] }, true),
    ).toEqual({
      status: "error",
      message: "QUOTA_BYTES quota exceeded",
    });
  });

  test("a method the worker's own store does not implement is an unreachable store", async () => {
    const worker = createWorkerApi();

    const relay = createStorageRelay([worker.extensionApi]);

    expect(await relay.run({ area: "local", method: "getKeys", arguments: [] }, true)).toEqual({
      status: "error",
      message: STORAGE_UNAVAILABLE_ERROR,
    });

    expect(await relay.run({ area: "managed", method: "get", arguments: [] }, true)).toEqual({
      status: "error",
      message: STORAGE_UNAVAILABLE_ERROR,
    });
  });

  test("a native method that throws is an error rather than a hang", async () => {
    const worker = createWorkerApi();

    (worker.local as ChromeNamespace).get = () => {
      throw new Error("bindings gone");
    };

    const relay = createStorageRelay([worker.extensionApi]);

    expect(await relay.run({ area: "local", method: "get", arguments: [] }, true)).toEqual({
      status: "error",
      message: "bindings gone",
    });
  });

  test("a runtime that answers with a promise instead of the callback is handled", async () => {
    const worker = createWorkerApi();

    (worker.local as ChromeNamespace).get = () => Promise.resolve({ unlocked: false });

    const relay = createStorageRelay([worker.extensionApi]);

    expect(await relay.run({ area: "local", method: "get", arguments: [] }, true)).toEqual({
      status: "ok",
      value: { unlocked: false },
    });
  });

  test("refuses a content script the area the extension closed, without touching the store", async () => {
    const worker = createWorkerApi();

    const relay = createStorageRelay([worker.extensionApi]);

    relay.mirrorAccessLevels();

    // Chrome's default for `session` closes it to content scripts
    expect(await relay.run({ area: "session", method: "get", arguments: [] }, false)).toEqual({
      status: "error",
      message: STORAGE_ACCESS_DENIED_ERROR,
    });

    // And an extension page reaches it
    expect(await relay.run({ area: "session", method: "get", arguments: ["k"] }, true)).toEqual({
      status: "ok",
      value: { k: undefined },
    });
  });

  test("holds a call against the level recorded when the extension set it", async () => {
    stubFetch();

    const worker = createWorkerApi();

    const relay = createStorageRelay([worker.extensionApi]);

    relay.mirrorAccessLevels();

    // `local` is open by default, so this is the level doing the work
    await (worker.local.setAccessLevel as (options: unknown) => Promise<unknown>)({
      accessLevel: "TRUSTED_CONTEXTS",
    });

    expect(await relay.run({ area: "local", method: "get", arguments: ["k"] }, false)).toEqual({
      status: "error",
      message: STORAGE_ACCESS_DENIED_ERROR,
    });

    expect(worker.store.size).toBe(0);
  });

  test("a content script never sets an access level, even relayed", async () => {
    const worker = createWorkerApi();

    const relay = createStorageRelay([worker.extensionApi]);

    relay.mirrorAccessLevels();

    expect(
      await relay.run(
        {
          area: "local",
          method: "setAccessLevel",
          arguments: [{ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" }],
        },
        false,
      ),
    ).toEqual({ status: "error", message: STORAGE_ACCESS_LEVEL_CONTEXT_ERROR });

    expect(worker.accessLevelCalls).toEqual([]);
  });

  describe("mirrorAccessLevels", () => {
    test("reports the level the extension set, and still sets it natively", async () => {
      const posts = stubFetch();

      const worker = createWorkerApi();

      const relay = createStorageRelay([worker.extensionApi]);

      relay.mirrorAccessLevels();

      await (worker.local.setAccessLevel as (options: unknown) => Promise<unknown>)({
        accessLevel: "TRUSTED_CONTEXTS",
      });

      // The extension's own call still reached the native store
      expect(worker.accessLevelCalls).toEqual([{ accessLevel: "TRUSTED_CONTEXTS" }]);

      await waitFor(() => posts.length > 0, "the access level report");

      expect(posts).toEqual([
        {
          pathName: RUNTIME_PROXY_PATHS.workerStorageAccessLevel,
          body: { area: "local", accessLevel: "TRUSTED_CONTEXTS" },
        },
      ]);
    });

    test("reports nothing when the native call refused the level", async () => {
      const posts = stubFetch();

      const worker = createWorkerApi();

      worker.failMethod(
        "setAccessLevel",
        "This StorageArea is not available for setting access level",
      );

      const relay = createStorageRelay([worker.extensionApi]);

      relay.mirrorAccessLevels();

      await expect(
        (worker.local.setAccessLevel as (options: unknown) => Promise<unknown>)({
          accessLevel: "TRUSTED_CONTEXTS",
        }),
      ).rejects.toThrow("This StorageArea is not available for setting access level");

      expect(posts).toEqual([]);
    });

    test("gives the extension's own callback the lastError the native call left", async () => {
      stubFetch();

      const worker = createWorkerApi();

      worker.failMethod(
        "setAccessLevel",
        "This StorageArea is not available for setting access level",
      );

      const relay = createStorageRelay([worker.extensionApi]);

      relay.mirrorAccessLevels();

      let seenError: string | undefined;

      const runtime = worker.extensionApi.runtime as ChromeNamespace;

      (worker.local.setAccessLevel as (options: unknown, callback: () => void) => undefined)(
        { accessLevel: "TRUSTED_CONTEXTS" },
        () => {
          seenError = (runtime.lastError as { message?: string } | undefined)?.message;
        },
      );

      // This wrapper is the one thing in front of the worker's native storage,
      // so the extension's own error handling has to keep working through it
      await waitFor(() => seenError !== undefined, "the callback");

      expect(seenError).toBe("This StorageArea is not available for setting access level");

      expect(runtime.lastError).toBeUndefined();
    });

    test("a relayed setAccessLevel reports the native failure rather than answering ok", async () => {
      stubFetch();

      const worker = createWorkerApi();

      worker.failMethod("setAccessLevel", "Context cannot set the storage access level");

      const relay = createStorageRelay([worker.extensionApi]);

      relay.mirrorAccessLevels();

      expect(
        await relay.run(
          {
            area: "local",
            method: "setAccessLevel",
            arguments: [{ accessLevel: "TRUSTED_CONTEXTS" }],
          },
          true,
        ),
      ).toEqual({ status: "error", message: "Context cannot set the storage access level" });
    });

    test("the level is reported before a relayed setAccessLevel is answered", async () => {
      let hasReported = false;

      globalThis.fetch = (async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));

        hasReported = true;

        return new Response(null, { status: 204 });
      }) as unknown as typeof fetch;

      const worker = createWorkerApi();

      const relay = createStorageRelay([worker.extensionApi]);

      relay.mirrorAccessLevels();

      // An extension page that awaits this is entitled to the new level being
      // in force by the time a content script reads, and main learns it from
      // the report rather than from the answer
      await relay.run(
        {
          area: "local",
          method: "setAccessLevel",
          arguments: [{ accessLevel: "TRUSTED_CONTEXTS" }],
        },
        true,
      );

      expect(hasReported).toBe(true);
    });

    test("answers the callback form, the way 1Password's own boot-time call makes it", async () => {
      const posts = stubFetch();

      const worker = createWorkerApi();

      const relay = createStorageRelay([worker.extensionApi]);

      relay.mirrorAccessLevels();

      let hasAnswered = false;

      (worker.local.setAccessLevel as (options: unknown, callback: () => void) => undefined)(
        { accessLevel: "TRUSTED_CONTEXTS" },
        () => {
          hasAnswered = true;
        },
      );

      await waitFor(() => hasAnswered, "the callback");

      await waitFor(() => posts.length > 0, "the access level report");
    });

    test("mirrors an area shared by chrome and browser only once", async () => {
      const posts = stubFetch();

      const worker = createWorkerApi();

      // Electron builds two objects; whether they share the area objects is
      // not something this layer gets to know, so both cases have to be safe
      const browserApi = worker.extensionApi;

      const relay = createStorageRelay([worker.extensionApi, browserApi]);

      relay.mirrorAccessLevels();

      relay.mirrorAccessLevels();

      await (worker.local.setAccessLevel as (options: unknown) => Promise<unknown>)({
        accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
      });

      await waitFor(() => posts.length > 0, "the access level report");

      expect(posts).toHaveLength(1);

      expect(worker.accessLevelCalls).toHaveLength(1);
    });

    test("leaves an area without setAccessLevel alone", () => {
      const worker = createWorkerApi();

      const sessionArea = (worker.extensionApi.storage as ChromeNamespace)
        .session as ChromeNamespace;

      const nativeGet = sessionArea.get;

      createStorageRelay([worker.extensionApi]).mirrorAccessLevels();

      expect(sessionArea.setAccessLevel).toBeUndefined();

      expect(sessionArea.get).toBe(nativeGet);
    });
  });

  describe("watchChanges", () => {
    test("reports every change of the worker's store, with the area's level", async () => {
      const posts = stubFetch();

      const worker = createWorkerApi();

      createStorageRelay([worker.extensionApi]).watchChanges();

      const changes = { unlocked: { oldValue: false, newValue: true } };

      worker.fireChange(changes, "local");

      await waitFor(() => posts.length > 0, "the change report");

      expect(posts).toEqual([
        {
          pathName: RUNTIME_PROXY_PATHS.workerStorageChanged,
          body: {
            area: "local",
            changes,
            // Chrome's default for `local`, which nothing has changed
            accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
          },
        },
      ]);
    });

    test("stamps a change with the level the extension set, not Chrome's default", async () => {
      const posts = stubFetch();

      const worker = createWorkerApi();

      const relay = createStorageRelay([worker.extensionApi]);

      relay.mirrorAccessLevels();

      relay.watchChanges();

      await (worker.local.setAccessLevel as (options: unknown) => Promise<unknown>)({
        accessLevel: "TRUSTED_CONTEXTS",
      });

      await waitFor(() => posts.length > 0, "the access level report");

      worker.fireChange({ unlocked: { newValue: true } }, "local");

      await waitFor(() => posts.length > 1, "the change report");

      expect(posts[1]?.body.accessLevel).toBe("TRUSTED_CONTEXTS");
    });

    test("listens on one global only, so a change is reported once", async () => {
      const posts = stubFetch();

      const worker = createWorkerApi();

      // Electron builds `chrome` and `browser` separately, and both dispatch
      // every change of the one store
      const browser = createWorkerApi();

      createStorageRelay([worker.extensionApi, browser.extensionApi]).watchChanges();

      expect(worker.changedListeners).toHaveLength(1);

      expect(browser.changedListeners).toHaveLength(0);

      worker.fireChange({ unlocked: { newValue: true } }, "local");

      await waitFor(() => posts.length > 0, "the change report");

      expect(posts).toHaveLength(1);
    });

    test("says nothing about a change it cannot read", async () => {
      const posts = stubFetch();

      const worker = createWorkerApi();

      createStorageRelay([worker.extensionApi]).watchChanges();

      worker.fireChange({ unlocked: { newValue: true } }, "somewhere-else");

      worker.fireChange(undefined, "local");

      worker.fireChange({ unlocked: { newValue: true } }, "local");

      await waitFor(() => posts.length > 0, "the change report");

      // Only the third, and the two before it neither threw nor were reported
      expect(posts.map((post) => post.body.area)).toEqual(["local"]);
    });

    test("an extension API without a storage.onChanged is left alone", () => {
      const relay = createStorageRelay([{ runtime: { id: "x" }, storage: { local: {} } }]);

      expect(() => {
        relay.watchChanges();
      }).not.toThrow();
    });
  });
});
