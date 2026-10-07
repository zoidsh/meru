import type { ChromeNamespace } from "../facade/lib/chrome";
import { invokeNativeMethod, type NativeMethod } from "./native-storage-call";
import { getAffectedKeys } from "./storage-synthesis";

const WRITE_METHOD_NAMES = ["set", "remove", "clear"] as const;

/**
 * Records the keys every write through the area touches until it is stopped, a
 * `clear` touching every key. The write itself goes on as it came.
 */
function watchWrites(local: ChromeNamespace) {
  const touchedKeys = new Set<string>();

  let hasCleared = false;

  let isWatching = true;

  const restores: (() => void)[] = [];

  for (const method of WRITE_METHOD_NAMES) {
    const write = local[method];

    if (typeof write !== "function") {
      continue;
    }

    const watchedWrite = (...callArguments: unknown[]) => {
      if (isWatching) {
        const keys = getAffectedKeys(method, callArguments);

        if (keys === null) {
          hasCleared = true;
        } else {
          for (const key of keys) {
            touchedKeys.add(key);
          }
        }
      }

      return (write as NativeMethod).apply(local, callArguments);
    };

    local[method] = watchedWrite;

    restores.push(() => {
      // Something that wrapped the method after this keeps its wrapper, and
      // this one under it goes on passing writes through
      if (local[method] === watchedWrite) {
        local[method] = write;
      }
    });
  }

  return {
    wasTouched: (key: string) => hasCleared || touchedKeys.has(key),
    stop: () => {
      isWatching = false;

      for (const restore of restores) {
        restore();
      }
    },
  };
}

/**
 * Writes the embedder's defaults into the worker's `chrome.storage.local` for
 * every key the store does not hold yet, which is how a setting the extension
 * reads from storage gets a default other than the one its code falls back to.
 *
 * A key that is there is left alone, whatever its value, so a choice the user
 * made in the extension outlives every launch. Written through the area's own
 * `set`, so where synthesis is installed the extension hears the default
 * arrive like any other change.
 *
 * The extension's own script runs while the read is out, and may write a key
 * in that gap, which the read cannot see. Chromium runs an extension's storage
 * calls in the order they are made, so every write made through this context
 * between the read and the seed's own `set` is watched, and a key one touched
 * is not seeded. A write by an extension page of the worker's session in the
 * same gap is not seen, being made in another context.
 *
 * Runs on every worker start rather than once at install, which Meru never
 * sees: an absent key is the only sign that nothing was chosen, and it reads
 * the same on the first start as on the hundredth.
 */
export async function seedLocalStorageDefaults(
  extensionApi: ChromeNamespace,
  defaults: Record<string, unknown>,
) {
  const keys = Object.keys(defaults);

  const local = (extensionApi.storage as ChromeNamespace | undefined)?.local as
    | ChromeNamespace
    | undefined;

  if (keys.length === 0 || typeof local?.get !== "function" || typeof local.set !== "function") {
    return;
  }

  const runtime = extensionApi.runtime as ChromeNamespace | undefined;

  const set = local.set as NativeMethod;

  const writes = watchWrites(local);

  const stored = await invokeNativeMethod(runtime, local, local.get as NativeMethod, [keys]);

  writes.stop();

  if (stored.status !== "ok" || typeof stored.value !== "object" || stored.value === null) {
    return;
  }

  const storedItems = stored.value as Record<string, unknown>;

  const missingItems = Object.fromEntries(
    keys
      .filter((key) => !(key in storedItems) && !writes.wasTouched(key))
      .map((key) => [key, defaults[key]]),
  );

  if (Object.keys(missingItems).length === 0) {
    return;
  }

  await invokeNativeMethod(runtime, local, set, [missingItems]);
}
