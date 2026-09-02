import type { Session } from "electron";
import type { SharedExtensionInstance } from "../extensions";
import { RuntimeProxy } from "./runtime-proxy";
import type { GetWebContentsFromFrame } from "./sender";

export type CreateSharedExtensionInstanceOptions = {
  /**
   * The bundled shim, written into every content-script-only copy, prepended to
   * each of its `content_scripts` entries and injected into each of its
   * extension pages.
   */
  shimScriptPath: string;
  /**
   * The bundled worker-side relay client, written into the worker session's
   * copy and imported by its service worker wrapper.
   */
  relayScriptPath: string;
  /** How a caller frame resolves to its hosting tab for sender reconstruction. */
  getWebContentsFromFrame?: GetWebContentsFromFrame;
};

/**
 * One shared extension instance serving every session, in place of one full
 * instance per session: the first session set up keeps the whole extension —
 * the one service worker, the one `chrome.storage` — and every later session
 * gets a content-script-only copy whose `chrome.runtime` messaging the
 * `RuntimeProxy` relays to that worker and back — from its content scripts and
 * from its extension pages, which is where a password manager keeps its unlock
 * UI. The prize is one sign-in to a password manager instead of one per
 * account; one worker at any session count instead of one per session comes
 * with it.
 *
 * The whole feature hangs off the one `sharedInstance` option this creates a
 * value for. An embedder that never passes it runs exactly as before, and
 * removing the feature is removing that option and this directory — plus the
 * one line of `derive/manifest.ts` that ends the worker's wrapper by starting
 * the relay, and the `RUNTIME_PROXY_RELAY_START_GLOBAL` it reads from
 * `bridge-protocol.ts`, which is the only thing outside this directory that
 * knows the proxy exists.
 */
export function createSharedExtensionInstance({
  shimScriptPath,
  relayScriptPath,
  getWebContentsFromFrame,
}: CreateSharedExtensionInstanceOptions): SharedExtensionInstance {
  let proxy: RuntimeProxy | undefined;

  let workerSession: Session | undefined;

  return {
    install({ bridge, logger }) {
      proxy = new RuntimeProxy({ logger, getWebContentsFromFrame });

      proxy.registerRoutes(bridge);
    },

    adoptSession(session) {
      // The first session set up keeps the worker. Which session that is is
      // deliberately not a setting: any one worker serves every session alike,
      // and the first one exists whenever any session does.
      if (!workerSession) {
        workerSession = session;

        proxy?.setWorkerSession(session);
      }

      return workerSession === session
        ? { role: "worker", relayScriptPath }
        : { role: "contentScriptOnly", shimScriptPath };
    },

    teardownSession(session) {
      // A torn-down worker session orphans the content-script-only sessions
      // until the next session adopts the worker role on a fresh instance;
      // the proxy answers them "receiving end does not exist" in between
      if (session === workerSession) {
        workerSession = undefined;
      }

      proxy?.teardownSession(session);
    },
  };
}
