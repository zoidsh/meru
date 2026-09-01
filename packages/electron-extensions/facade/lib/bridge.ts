import { EXTENSION_BRIDGE_TOKEN_GLOBAL, getExtensionBridgeUrl } from "../../bridge/protocol";

/**
 * A call to the main-process end of the bridge, carrying the token the derived
 * copy of the facade wrote next to this script — what tells the bridge which
 * extension is calling, since the request itself carries no sender.
 *
 * The token rides the query string rather than the body so that the bridge can
 * refuse an unknown one without reading the body at all; see
 * `EXTENSION_BRIDGE_TOKEN_PARAM`.
 */
export function postBridge(pathName: string, body: Record<string, unknown>) {
  const bridgeToken =
    (globalThis as unknown as Record<string, string | undefined>)[EXTENSION_BRIDGE_TOKEN_GLOBAL] ??
    "";

  return fetch(getExtensionBridgeUrl(pathName, bridgeToken), {
    method: "POST",
    // A safelisted content type keeps this a simple request, so no preflight
    headers: { "content-type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(body),
  });
}
