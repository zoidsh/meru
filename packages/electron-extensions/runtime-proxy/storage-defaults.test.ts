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
