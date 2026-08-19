import { EXTENSION_BRIDGE_ORIGIN, EXTENSION_BRIDGE_TOKEN_GLOBAL } from "../../bridge/protocol";

/**
 * A call to the main-process end of the bridge, carrying the token the derived
 * copy of the facade wrote next to this script — what tells the bridge which
 * extension is calling, since the request itself carries no sender.
 */
export function postBridge(pathName: string, body: Record<string, unknown>) {
  // The derived copy of the facade writes the token onto the global itself.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const token = (globalThis as unknown as Record<string, string | undefined>)[
    EXTENSION_BRIDGE_TOKEN_GLOBAL
  ];

  return fetch(`${EXTENSION_BRIDGE_ORIGIN}${pathName}`, {
    method: "POST",
    // A safelisted content type keeps this a simple request, so no preflight
    headers: { "content-type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ ...body, token }),
  });
}
