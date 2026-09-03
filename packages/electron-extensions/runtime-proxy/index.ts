import type { Session, WebContents } from "electron";
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
  /**
   * Whether a page is the one its window is showing, which is what Chrome's
   * `tabs.Tab.active` means and what `tabs.query({active: true})` filters on.
   * Only the embedder knows: it owns the surface a page is drawn in, and
   * Electron's own answer is `isFocused`, which is a different question —
   * 1Password unlocks behind a Touch ID prompt raised by its desktop app, so
   * at the moment its worker asks for the active tab none of Meru's views is
   * focused and a focus-based answer would send the unlock to nobody.
   *
   * Without it the worker hears Electron's answer, which is honest and narrow
   * rather than wrong.
   */
  isActiveTab?: (contents: WebContents) => boolean;
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
  isActiveTab,
}: CreateSharedExtensionInstanceOptions): SharedExtensionInstance {
  let proxy: RuntimeProxy | undefined;

  let workerSession: Session | undefined;

  const shimmedSessions = new Set<Session>();

  return {
    install({ bridge, logger }) {
      proxy = new RuntimeProxy({
        logger,
        getWebContentsFromFrame,
        // The same bookkeeping `canResolveTabAcrossSessions` answers from, for
        // the same reason: which sessions are shimmed is what `adoptSession`
        // already keeps, and a second copy of it would be free to drift
        isShimmedSession: (session) => shimmedSessions.has(session),
        isActiveTab,
      });

      proxy.registerRoutes(bridge);
    },

    adoptSession(session) {
      // Which session plays the worker is settled before any of them is set
      // up, so order decides nothing: a session either is the one the embedder
      // named or is content-script-only, whether it came first or last.
      if (session !== getWorkerSession()) {
        shimmedSessions.add(session);

        return { role: "contentScriptOnly", shimScriptPath };
      }

      shimmedSessions.delete(session);

      if (workerSession !== session) {
        workerSession = session;

        proxy?.setWorkerSession(session);
      }

      return { role: "worker", relayScriptPath };
    },

    /*
     * `chrome.webNavigation.getFrame` from the one worker, which is how
     * 1Password finds the frame owning a form before it relays an inline-menu
     * click to it. The worker session holds no account's tabs, so scoping the
     * frame queries to the asking session — the loader's own default, and the
     * right answer for an instance per session — leaves every such query
     * answering null and the relay dropped silently. Only the worker crosses,
     * and only into a session it shims: a shimmed session asking about
     * another's tabs stays refused, and so does any session this never
     * adopted.
     */
    canResolveTabAcrossSessions(askingSession, tabSession) {
      return askingSession === workerSession && shimmedSessions.has(tabSession);
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

      shimmedSessions.delete(session);

      proxy?.teardownSession(session);

      return wasWorkerSession;
    },
  };
}
