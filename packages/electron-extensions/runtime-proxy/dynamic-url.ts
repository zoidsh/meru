import type { ChromeNamespace } from "../facade/lib/chrome";
import { EXTENSION_SCHEME_PREFIX } from "./bridge-protocol";

/**
 * Turns the worker's dynamic extension URLs into static ones in what it sends
 * to the other sessions.
 *
 * An extension whose `web_accessible_resources` set `use_dynamic_url` gets
 * `chrome.runtime.getURL` answers on a per-session id, `chrome.runtime.dynamicId`
 * — a random GUID in place of the extension id — and every session that loaded
 * the extension mints its own. Each resolves only in the session that minted
 * it. So a URL the worker builds and hands to an account's content script
 * names a host the account's copy has never heard of, and the frame loads
 * nothing: Bitwarden's inline menu was that, its button and list frames
 * pointing at the worker session's GUID.
 *
 * The static id resolves in every session alike, the derived copies sharing
 * their `key`, so the worker's GUID is rewritten to it. The GUID is a UUID and
 * appears only as a URL's host, so a text replacement over the serialized
 * body cannot reach anything else.
 *
 * Only for an extension whose manifest asks for dynamic URLs anywhere. Any
 * other never puts the GUID in a URL, so it has nothing to rewrite and does
 * not pay for the search.
 */
export function createDynamicUrlRewrite(extensionApi: ChromeNamespace | undefined) {
  const runtime = extensionApi?.runtime as ChromeNamespace | undefined;

  const dynamicId = runtime?.dynamicId;

  const extensionId = runtime?.id;

  if (
    typeof dynamicId !== "string" ||
    typeof extensionId !== "string" ||
    dynamicId === "" ||
    dynamicId === extensionId ||
    !usesDynamicUrls(runtime)
  ) {
    return undefined;
  }

  const dynamicOrigin = `${EXTENSION_SCHEME_PREFIX}${dynamicId}`;

  const staticOrigin = `${EXTENSION_SCHEME_PREFIX}${extensionId}`;

  return (serializedBody: string) => serializedBody.replaceAll(dynamicOrigin, staticOrigin);
}

function usesDynamicUrls(runtime: ChromeNamespace | undefined) {
  try {
    const manifest = (runtime?.getManifest as (() => Record<string, unknown>) | undefined)?.();

    const webAccessibleResources = manifest?.web_accessible_resources;

    return (
      Array.isArray(webAccessibleResources) &&
      webAccessibleResources.some(
        (entry) =>
          typeof entry === "object" &&
          entry !== null &&
          (entry as { use_dynamic_url?: unknown }).use_dynamic_url === true,
      )
    );
  } catch {
    return false;
  }
}
