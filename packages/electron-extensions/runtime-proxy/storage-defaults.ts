import type { ChromeNamespace } from "../facade/lib/chrome";
import { invokeNativeMethod, type NativeMethod } from "./native-storage-call";

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

  const stored = await invokeNativeMethod(runtime, local, local.get as NativeMethod, [keys]);

  if (stored.status !== "ok" || typeof stored.value !== "object" || stored.value === null) {
    return;
  }

  const storedItems = stored.value as Record<string, unknown>;

  const missingItems = Object.fromEntries(
    keys.filter((key) => !(key in storedItems)).map((key) => [key, defaults[key]]),
  );

  if (Object.keys(missingItems).length === 0) {
    return;
  }

  await invokeNativeMethod(runtime, local, local.set as NativeMethod, [missingItems]);
}
