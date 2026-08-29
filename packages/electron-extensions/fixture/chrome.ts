/**
 * The slice of Chrome's extension API the fixture extension uses, typed by
 * hand: the repository carries no `@types/chrome`, and the facade's own
 * `ChromeNamespace` is deliberately an opaque bag. Only what the fixture
 * calls is declared, so a call outside this slice is a type error rather
 * than an untyped reach into the namespace.
 */

export type FixtureTab = {
  id?: number;
  url?: string;
};

export type FixtureMessageSender = {
  id?: string;
  url?: string;
  origin?: string;
  frameId?: number;
  tab?: FixtureTab;
};

export type FixtureEvent<Listener> = {
  addListener: (listener: Listener) => void;
};

export type FixturePort = {
  name: string;
  sender?: FixtureMessageSender;
  postMessage: (message: unknown) => void;
  disconnect: () => void;
  onMessage: FixtureEvent<(message: unknown) => void>;
  onDisconnect: FixtureEvent<() => void>;
};

export type FixtureManifest = {
  background?: unknown;
};

export type FixtureRuntime = {
  id: string;
  lastError?: { message?: string };
  getManifest?: () => FixtureManifest;
  sendMessage: (message: unknown, callback: (reply: unknown) => void) => void;
  connect: (connectInfo: { name: string }) => FixturePort;
  onMessage: FixtureEvent<
    (message: unknown, sender: FixtureMessageSender, sendResponse: (reply: unknown) => void) => void
  >;
  onConnect: FixtureEvent<(port: FixturePort) => void>;
};

/**
 * The `chrome` global of whatever extension context this runs in — the
 * service worker, a content script's isolated world, or an extension page.
 * In a content-script-only derived copy the runtime proxy's shim has already
 * shadowed `runtime.sendMessage` and `runtime.connect` by the time the
 * fixture's scripts run, which is exactly what the fixture is here to
 * exercise.
 */
export function getChromeRuntime(): FixtureRuntime {
  const contextGlobals = globalThis as unknown as { chrome: { runtime: FixtureRuntime } };

  return contextGlobals.chrome.runtime;
}
