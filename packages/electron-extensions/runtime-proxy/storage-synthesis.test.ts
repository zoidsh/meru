import { afterEach, describe, expect, test } from "bun:test";
import type { ChromeEventListener, ChromeNamespace } from "../facade/lib/chrome";
import { RUNTIME_PROXY_PATHS } from "./bridge-protocol";
import { createStorageRelay } from "./storage-relay";
import { diffStorageItems, getAffectedKeys, installStorageSynthesis } from "./storage-synthesis";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Lets every queued callback and timer of the fake store run. */
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

type Callback = (value?: unknown) => void;

/**
 * A worker's `chrome.storage`, answering in the callback form only, a few
 * milliseconds late but in the order the calls were made, as Chromium runs an
 * extension's storage calls. Its events record what was registered on them
 * natively, which the synthesis must never do.
 */
function createWorkerApi() {
  const runtime: ChromeNamespace = {};

  const failures = new Map<string, string>();

  const nativeRegistrations: ChromeEventListener[] = [];

  const createEvent = (): ChromeNamespace => ({
    addListener(listener: ChromeEventListener) {
      nativeRegistrations.push(listener);
    },
    removeListener() {},
    hasListener: () => false,
    hasListeners: () => false,
  });

  let backend = Promise.resolve();

  const later = (method: string, callback: unknown, run: () => unknown) => {
    // Chromium's signature matching refuses anything but a function in the
    // callback's place, synchronously
    if (typeof callback !== "function") {
      throw new TypeError("No matching signature.");
    }

    backend = backend.then(() => new Promise((resolve) => setTimeout(resolve, Math.random() * 3)));

    void backend.then(() => {
      const failure = failures.get(method);

      const value = failure === undefined ? run() : undefined;

      if (failure !== undefined) {
        runtime.lastError = { message: failure };
      }

      try {
        (callback as Callback)(value);
      } finally {
        delete runtime.lastError;
      }
    });
  };

  const createArea = () => {
    const store = new Map<string, unknown>();

    const area: ChromeNamespace = {
      store,
      onChanged: createEvent(),
      get(keys: unknown, callback: unknown) {
        later("get", callback, () => {
          const wanted =
            keys === null
              ? [...store.keys()]
              : typeof keys === "string"
                ? [keys]
                : (keys as string[]);

          return Object.fromEntries(
            wanted.filter((key) => store.has(key)).map((key) => [key, store.get(key)]),
          );
        });
      },
      set(items: Record<string, unknown>, callback: unknown) {
        later("set", callback, () => {
          for (const [key, value] of Object.entries(items)) {
            store.set(key, structuredClone(value));
          }
        });
      },
      remove(keys: string | string[], callback: unknown) {
        later("remove", callback, () => {
          for (const key of typeof keys === "string" ? [keys] : keys) {
            store.delete(key);
          }
        });
      },
      clear(callback: unknown) {
        later("clear", callback, () => {
          store.clear();
        });
      },
    };

    return area;
  };

  const local = createArea();

  const session = createArea();

  const storage: ChromeNamespace = { local, session, onChanged: createEvent() };

  return {
    extensionApi: { runtime, storage } as ChromeNamespace,
    runtime,
    storage,
    local,
    session,
    failures,
    nativeRegistrations,
  };
}

type Heard = { event: "area" | "topLevel"; changes: unknown; areaName?: unknown };

function listen(api: ReturnType<typeof createWorkerApi>) {
  const heard: Heard[] = [];

  (api.local.onChanged as { addListener: (listener: ChromeEventListener) => void }).addListener(
    (changes) => {
      heard.push({ event: "area", changes });
    },
  );

  (api.storage.onChanged as { addListener: (listener: ChromeEventListener) => void }).addListener(
    (changes, areaName) => {
      heard.push({ event: "topLevel", changes, areaName });
    },
  );

  return heard;
}

function call(area: ChromeNamespace, method: string, ...callArguments: unknown[]) {
  return (area[method] as (...callArguments: unknown[]) => unknown)(...callArguments);
}

describe("getAffectedKeys", () => {
  test("names the keys of a set, a remove's one key or several, and every key for a clear", () => {
    expect(getAffectedKeys("set", [{ a: 1, b: 2 }])).toEqual(["a", "b"]);

    expect(getAffectedKeys("remove", ["a"])).toEqual(["a"]);

    expect(getAffectedKeys("remove", [["a", 1, "b"]])).toEqual(["a", "b"]);

    expect(getAffectedKeys("clear", [])).toBeNull();
  });

  test("names nothing for a malformed call, which the native write is left to refuse", () => {
    expect(getAffectedKeys("set", ["a"])).toEqual([]);

    expect(getAffectedKeys("set", [["a"]])).toEqual([]);

    expect(getAffectedKeys("remove", [{ a: 1 }])).toEqual([]);
  });
});

describe("diffStorageItems", () => {
  test("reports additions, removals and changes in onChanged's shape", () => {
    expect(
      diffStorageItems({ removed: 1, changed: { x: 1 } }, { changed: { x: 2 }, added: [1] }),
    ).toEqual({
      removed: { oldValue: 1 },
      changed: { oldValue: { x: 1 }, newValue: { x: 2 } },
      added: { newValue: [1] },
    });
  });

  test("reports nothing for a key written with the value it had", () => {
    expect(diffStorageItems({ same: { x: [1] } }, { same: { x: [1] } })).toEqual({});
  });
});

describe("installStorageSynthesis", () => {
  test("dispatches a write to the area's event and the top-level one, named", async () => {
    const api = createWorkerApi();

    installStorageSynthesis([api.extensionApi]);

    const heard = listen(api);

    await call(api.local, "set", { a: 1 });

    expect(heard).toEqual([
      { event: "area", changes: { a: { newValue: 1 } } },
      { event: "topLevel", changes: { a: { newValue: 1 } }, areaName: "local" },
    ]);
  });

  test("never registers a listener natively", async () => {
    const api = createWorkerApi();

    installStorageSynthesis([api.extensionApi]);

    listen(api);

    expect(api.nativeRegistrations).toEqual([]);

    expect((api.local.onChanged as { hasListeners: () => boolean }).hasListeners()).toBe(true);
  });

  test("reports a remove and a clear with the values they took away", async () => {
    const api = createWorkerApi();

    installStorageSynthesis([api.extensionApi]);

    await call(api.local, "set", { a: 1, b: 2, c: 3 });

    const heard = listen(api);

    await call(api.local, "remove", "a");

    await call(api.local, "clear");

    expect(heard.filter(({ event }) => event === "area").map(({ changes }) => changes)).toEqual([
      { a: { oldValue: 1 } },
      { b: { oldValue: 2 }, c: { oldValue: 3 } },
    ]);
  });

  test("dispatches nothing for a write that changed nothing", async () => {
    const api = createWorkerApi();

    installStorageSynthesis([api.extensionApi]);

    await call(api.local, "set", { a: { x: 1 } });

    const heard = listen(api);

    await call(api.local, "set", { a: { x: 1 } });

    await call(api.local, "remove", "absent");

    await call(api.local, "set", {});

    expect(heard).toEqual([]);
  });

  test("keeps each area's changes to that area", async () => {
    const api = createWorkerApi();

    installStorageSynthesis([api.extensionApi]);

    const heard = listen(api);

    await call(api.session, "set", { a: 1 });

    expect(heard).toEqual([
      { event: "topLevel", changes: { a: { newValue: 1 } }, areaName: "session" },
    ]);
  });

  test("runs overlapping writes one at a time, so each reports its own change", async () => {
    const api = createWorkerApi();

    installStorageSynthesis([api.extensionApi]);

    const heard = listen(api);

    await Promise.all([
      call(api.local, "set", { a: 1 }),
      call(api.local, "set", { a: 2 }),
      call(api.local, "remove", "a"),
    ]);

    expect(heard.filter(({ event }) => event === "area").map(({ changes }) => changes)).toEqual([
      { a: { newValue: 1 } },
      { a: { oldValue: 1, newValue: 2 } },
      { a: { oldValue: 2 } },
    ]);
  });

  test("hands the write to the store in the call itself, ahead of anything after it", () => {
    const api = createWorkerApi();

    const nativeCalls: string[] = [];

    for (const method of ["get", "set"]) {
      const native = api.local[method] as (...callArguments: unknown[]) => void;

      api.local[method] = (...callArguments: unknown[]) => {
        nativeCalls.push(method);

        native(...callArguments);
      };
    }

    installStorageSynthesis([api.extensionApi]);

    void call(api.local, "set", { a: 1 });

    expect(nativeCalls).toEqual(["get", "set", "get"]);
  });

  test("takes a trailing undefined or null for an omitted argument, as Chrome does", async () => {
    const api = createWorkerApi();

    installStorageSynthesis([api.extensionApi]);

    const heard = listen(api);

    await call(api.local, "set", { a: 1 }, undefined);

    let lastError: unknown = "unset";

    call(api.local, "remove", "a", null, () => {
      lastError = api.runtime.lastError;
    });

    await settle();

    expect(lastError).toBeUndefined();

    expect(heard.filter(({ event }) => event === "area").map(({ changes }) => changes)).toEqual([
      { a: { newValue: 1 } },
      { a: { oldValue: 1 } },
    ]);
  });

  test("leaves reads unshadowed", () => {
    const api = createWorkerApi();

    const nativeGet = api.local.get;

    installStorageSynthesis([api.extensionApi]);

    expect(api.local.get).toBe(nativeGet);
  });

  test("answers the callback form after the listeners, with the read's value", async () => {
    const api = createWorkerApi();

    installStorageSynthesis([api.extensionApi]);

    const heard = listen(api);

    const order: string[] = [];

    (api.local.onChanged as { addListener: (listener: ChromeEventListener) => void }).addListener(
      () => {
        order.push("listener");
      },
    );

    const returned = call(api.local, "set", { a: 1 }, () => {
      order.push("callback");
    });

    expect(returned).toBeUndefined();

    let read: unknown;

    call(api.local, "get", "a", (value: unknown) => {
      read = value;
    });

    await settle();

    expect(order).toEqual(["listener", "callback"]);

    expect(read).toEqual({ a: 1 });

    expect(heard).toHaveLength(2);
  });

  test("sets lastError for a failed write's callback and dispatches nothing", async () => {
    const api = createWorkerApi();

    installStorageSynthesis([api.extensionApi]);

    const heard = listen(api);

    api.failures.set("set", "QUOTA_BYTES quota exceeded");

    let seen: unknown;

    call(api.local, "set", { a: 1 }, () => {
      seen = api.runtime.lastError;
    });

    await settle();

    expect(seen).toEqual({ message: "QUOTA_BYTES quota exceeded" });

    expect(api.runtime.lastError).toBeUndefined();

    expect(heard).toEqual([]);
  });

  test("rejects a failed write's promise, and the next write still runs", async () => {
    const api = createWorkerApi();

    installStorageSynthesis([api.extensionApi]);

    const heard = listen(api);

    api.failures.set("set", "QUOTA_BYTES quota exceeded");

    await expect(call(api.local, "set", { a: 1 }) as Promise<unknown>).rejects.toThrow(
      "QUOTA_BYTES quota exceeded",
    );

    api.failures.delete("set");

    await call(api.local, "set", { a: 2 });

    expect(heard).toHaveLength(2);
  });

  test("keeps dispatching to the other listeners when one throws", async () => {
    const api = createWorkerApi();

    installStorageSynthesis([api.extensionApi]);

    const originalConsoleError = console.error;

    console.error = () => {};

    try {
      (api.local.onChanged as { addListener: (listener: ChromeEventListener) => void }).addListener(
        () => {
          throw new Error("listener failed");
        },
      );

      const heard = listen(api);

      await call(api.local, "set", { a: 1 });

      expect(heard).toHaveLength(2);
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("feeds the relay's fan-out, for the worker's writes and relayed ones", async () => {
    const api = createWorkerApi();

    const posts: { pathName: string; body: unknown }[] = [];

    globalThis.fetch = (async (url: string, init: RequestInit) => {
      posts.push({ pathName: new URL(url).pathname, body: JSON.parse(init.body as string) });

      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    const storageRelay = createStorageRelay([api.extensionApi]);

    installStorageSynthesis([api.extensionApi]);

    storageRelay.watchChanges();

    await call(api.local, "set", { a: 1 });

    const relayed = await storageRelay.run(
      { area: "local", method: "set", arguments: [{ b: 2 }] },
      false,
    );

    expect(relayed).toEqual({ status: "ok", value: undefined });

    await settle();

    expect(api.nativeRegistrations).toEqual([]);

    expect(
      posts.filter(({ pathName }) => pathName === RUNTIME_PROXY_PATHS.workerStorageChanged),
    ).toEqual([
      {
        pathName: RUNTIME_PROXY_PATHS.workerStorageChanged,
        body: {
          area: "local",
          changes: { a: { newValue: 1 } },
          accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
        },
      },
      {
        pathName: RUNTIME_PROXY_PATHS.workerStorageChanged,
        body: {
          area: "local",
          changes: { b: { newValue: 2 } },
          accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
        },
      },
    ]);
  });
});
