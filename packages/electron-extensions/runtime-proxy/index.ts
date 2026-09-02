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
  /**
   * The session the one worker runs in. It is the embedder's to name rather
   * than the first session set up, so that no session can take the role by
   * being constructed first and none can take it away by going: Meru names
   * Electron's default session, which no account owns and which outlives every
   * account removal.
   *
   * Asked for lazily, since a `Session` cannot be created before the app is
   * ready and an embedder builds this at module scope.
   */
  getWorkerSession: () => Session;
  /** How a caller frame resolves to its hosting tab for sender reconstruction. */
  getWebContentsFromFrame?: GetWebContentsFromFrame;
};

/**
 * One shared extension instance serving every session, in place of one full
 * instance per session: the session the embedder names as the worker's keeps
 * the whole extension — the one service worker, the one `chrome.storage` — and
 * every other session gets a content-script-only copy whose `chrome.runtime`
 * messaging the `RuntimeProxy` relays to that worker and back — from its
 * content scripts and from its extension pages, which is where a password
 * manager keeps its unlock UI. The prize is one sign-in to a password manager
 * instead of one per account; one worker at any session count instead of one
 * per session comes with it.
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
  getWorkerSession,
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
      // Which session plays the worker is settled before any of them is set
      // up, so order decides nothing: a session either is the one the embedder
      // named or is content-script-only, whether it came first or last.
      if (session !== getWorkerSession()) {
        return { role: "contentScriptOnly", shimScriptPath };
      }

      if (workerSession !== session) {
        workerSession = session;

        proxy?.setWorkerSession(session);
      }

      return { role: "worker", relayScriptPath };
    },

    teardownSession(session) {
      // On Meru's own naming nothing ever calls this for the worker session at
      // all — the default session is torn down by neither an account removal
      // nor `before-quit` — so it answers false for the life of the app. The
      // loader passes the answer on regardless, so that a session tearing the
      // worker out from under the others stays something an embedder can
      // notice rather than something nothing reports
      const wasWorkerSession = session === workerSession;

      if (wasWorkerSession) {
        workerSession = undefined;
      }

      proxy?.teardownSession(session);

      return wasWorkerSession;
    },
  };
}
