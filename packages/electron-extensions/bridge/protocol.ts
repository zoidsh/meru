/**
 * The transport between the facade running inside an extension and the main
 * process, shared by both sides.
 *
 * Extension contexts have no IPC of their own — service worker preload scripts
 * never run for extension service workers on Electron 43 (see the injection
 * notes in the feature docs) — but they do have `fetch`, and a custom scheme
 * handled per session is something only the main process can answer. That is
 * the whole transport: one POST per call, routed by path to whichever `chrome.*`
 * implementation registered it.
 */

export const EXTENSION_BRIDGE_SCHEME = "extension-bridge";

/** Every request goes to the one bridge, so only the path varies. */
export const EXTENSION_BRIDGE_ORIGIN = `${EXTENSION_BRIDGE_SCHEME}://bridge`;

/**
 * Where the derived copy of an extension leaves the secret that says a request
 * came from that extension.
 *
 * Something has to, because nothing else in the request does: Electron hands
 * the handler no `Origin` header and no sender, and the scheme is reachable
 * from any document in the session whose own policy allows it — a workspace app
 * or any page a user navigates to. The secret is written into the extension's
 * copy of the facade, which only the extension can read, and is new on every
 * launch.
 */
export const EXTENSION_BRIDGE_TOKEN_GLOBAL = "__electronExtensionsBridgeToken";

export type ExtensionBridgeRequest = {
  token: string;
};
