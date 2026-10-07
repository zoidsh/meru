import { describe, expect, test } from "bun:test";
import type { ChromeNamespace } from "../facade/lib/chrome";
import { seedLocalStorageDefaults } from "./storage-defaults";

/** A `chrome.storage.local` in callback form, over a plain object. */
function createLocalArea(items: Record<string, unknown>) {
  const writes: Record<string, unknown>[] = [];

  const local = {
    get: (keys: string[], callback: (result: Record<string, unknown>) => void) => {
      callback(
        Object.fromEntries(keys.filter((key) => key in items).map((key) => [key, items[key]])),
      );
    },
    set: (newItems: Record<string, unknown>, callback: () => void) => {
      writes.push(newItems);

      Object.assign(items, newItems);

      callback();
    },
  };

  return { extensionApi: { runtime: {}, storage: { local } } as ChromeNamespace, items, writes };
}

describe("seedLocalStorageDefaults", () => {
  test("writes the defaults for the keys the store does not hold", async () => {
    const { extensionApi, items, writes } = createLocalArea({});

    await seedLocalStorageDefaults(extensionApi, { menu: { on: true }, other: 1 });

    expect(items).toEqual({ menu: { on: true }, other: 1 });

    expect(writes).toEqual([{ menu: { on: true }, other: 1 }]);
  });

  test("never writes over a value the store holds, whatever it is", async () => {
    const { extensionApi, items, writes } = createLocalArea({ menu: { on: false }, cleared: null });

    await seedLocalStorageDefaults(extensionApi, {
      menu: { on: true },
      cleared: "default",
      other: 1,
    });

    expect(items).toEqual({ menu: { on: false }, cleared: null, other: 1 });

    expect(writes).toEqual([{ other: 1 }]);
  });

  test("writes nothing when every key is already there", async () => {
    const { extensionApi, writes } = createLocalArea({ menu: 2 });

    await seedLocalStorageDefaults(extensionApi, { menu: 1 });

    expect(writes).toEqual([]);
  });

  test("writes nothing when the store cannot be read", async () => {
    const writes: unknown[] = [];

    const runtime: ChromeNamespace = {};

    const extensionApi = {
      runtime,
      storage: {
        local: {
          get: (_keys: unknown, callback: () => void) => {
            runtime.lastError = { message: "unavailable" };

            callback();

            delete runtime.lastError;
          },
          set: (newItems: unknown) => {
            writes.push(newItems);
          },
        },
      },
    } as ChromeNamespace;

    await seedLocalStorageDefaults(extensionApi, { menu: 1 });

    expect(writes).toEqual([]);
  });

  test("does nothing without a local area", async () => {
    await seedLocalStorageDefaults({ runtime: {} }, { menu: 1 });
  });
});

describe("seedLocalStorageDefaults while the extension writes", () => {
  /**
   * A local area whose calls run in the order they were made, a moment later,
   * so the extension's own script can write while the seed's read is out.
   */
  function createSlowLocalArea() {
    const items: Record<string, unknown> = {};

    const writes: Record<string, unknown>[] = [];

    let backend = Promise.resolve();

    const later = (run: () => unknown, callback: (value?: unknown) => void) => {
      backend = backend.then(() => new Promise((resolve) => setTimeout(resolve, 1)));

      void backend.then(() => {
        callback(run());
      });
    };

    const local: ChromeNamespace = {
      get: (keys: string[], callback: (value?: unknown) => void) => {
        later(
          () =>
            Object.fromEntries(keys.filter((key) => key in items).map((key) => [key, items[key]])),
          callback,
        );
      },
      set: (newItems: Record<string, unknown>, callback: () => void) => {
        later(() => {
          writes.push(newItems);

          Object.assign(items, newItems);
        }, callback);
      },
      remove: (keys: string | string[], callback: () => void) => {
        later(() => {
          for (const key of typeof keys === "string" ? [keys] : keys) {
            delete items[key];
          }
        }, callback);
      },
      clear: (callback: () => void) => {
        later(() => {
          for (const key of Object.keys(items)) {
            delete items[key];
          }
        }, callback);
      },
    };

    return {
      extensionApi: { runtime: {}, storage: { local } } as ChromeNamespace,
      local,
      items,
      writes,
    };
  }

  test("leaves a key the extension writes while the read is out", async () => {
    const { extensionApi, local, items, writes } = createSlowLocalArea();

    const seeded = seedLocalStorageDefaults(extensionApi, { menu: 2, other: 1 });

    (local.set as (items: unknown, callback: () => void) => void)({ menu: 0 }, () => undefined);

    await seeded;

    expect(items).toEqual({ menu: 0, other: 1 });

    expect(writes).toEqual([{ menu: 0 }, { other: 1 }]);
  });

  test("leaves a key the extension removes while the read is out", async () => {
    const { extensionApi, local, writes } = createSlowLocalArea();

    const seeded = seedLocalStorageDefaults(extensionApi, { menu: 2, other: 1 });

    (local.remove as (keys: unknown, callback: () => void) => void)("menu", () => undefined);

    await seeded;

    expect(writes).toEqual([{ other: 1 }]);
  });

  test("seeds nothing after a clear while the read is out", async () => {
    const { extensionApi, local, writes } = createSlowLocalArea();

    const seeded = seedLocalStorageDefaults(extensionApi, { menu: 2 });

    (local.clear as (callback: () => void) => void)(() => undefined);

    await seeded;

    expect(writes).toEqual([]);
  });

  test("hands the area its own methods back once the seed is written", async () => {
    const { extensionApi, local } = createSlowLocalArea();

    const { set, remove, clear } = local;

    await seedLocalStorageDefaults(extensionApi, { menu: 2 });

    expect([local.set, local.remove, local.clear]).toEqual([set, remove, clear]);
  });
});
