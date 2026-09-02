import { postBridge } from "../facade/lib/bridge";
import type { ChromeNamespace } from "../facade/lib/chrome";
import { createEvent } from "../facade/lib/event";
import { withLastError } from "../facade/lib/last-error";
import { NativeMessageDecoder } from "../native-messaging/framing";
import {
  MAX_RUNTIME_PROXY_FRAME_BYTES,
  PORT_CLOSED_ERROR,
  RECEIVING_END_ERROR,
  RUNTIME_PROXY_MANIFEST_GLOBAL,
  RUNTIME_PROXY_PATHS,
  type RuntimeProxyPortFrame,
  type RuntimeProxySenderReport,
  type RuntimeProxySendMessageResult,
} from "./bridge-protocol";
import { getNativeMethod, type NativeMethod, parseSendMessageArguments } from "./native-api";

const DISCONNECTED_PORT_ERROR = "Attempting to use a disconnected port object";

/** What a refused bridge call reads as, whatever the call was. */
function bridgeAnsweredError(status: number) {
  return `The runtime proxy bridge answered ${status}`;
}

/**
 * What a shimmed context can say about where it runs, read from its own
 * globals. The same two facts serve a content script and an extension page: the
 * main process holds the claim against the frame Chromium recorded as the
 * request's caller before anything trusts it, and reads a top-level document on
 * the extension's own scheme as the page it is.
 */
export function getContextSenderReport(): RuntimeProxySenderReport {
  const contextGlobals = globalThis as unknown as {
    location?: { href?: string };
    self?: unknown;
    top?: unknown;
  };

  return {
    url: contextGlobals.location?.href ?? "",
    isTopFrame: contextGlobals.self === contextGlobals.top,
  };
}

function createProxiedSendMessage(
  runtime: ChromeNamespace,
  nativeSendMessage: NativeMethod | undefined,
  getSenderReport: () => RuntimeProxySenderReport,
) {
  return (...callArguments: unknown[]) => {
    const callback =
      typeof callArguments.at(-1) === "function"
        ? (callArguments.pop() as (reply: unknown) => void)
        : undefined;

    const { targetExtensionId, message } = parseSendMessageArguments(callArguments);

    // A message aimed at another extension is none of the proxy's business;
    // whatever Electron does with it natively is the right answer
    if (targetExtensionId !== undefined && targetExtensionId !== runtime.id && nativeSendMessage) {
      return callback
        ? nativeSendMessage(...callArguments, callback)
        : nativeSendMessage(...callArguments);
    }

    const deliver = async () => {
      let result: RuntimeProxySendMessageResult;

      try {
        const response = await postBridge(RUNTIME_PROXY_PATHS.sendMessage, {
          message,
          sender: getSenderReport(),
        });

        if (!response.ok) {
          throw new Error(bridgeAnsweredError(response.status));
        }

        result = (await response.json()) as RuntimeProxySendMessageResult;
      } catch {
        // An unreachable bridge reads exactly like a session with no worker
        throw new Error(RECEIVING_END_ERROR);
      }

      if (result?.status === "replied") {
        return result.reply;
      }

      throw new Error(result?.status === "closed" ? PORT_CLOSED_ERROR : RECEIVING_END_ERROR);
    };

    const reply = deliver();

    if (!callback) {
      return reply;
    }

    reply.then(
      (replyValue) => {
        callback(replyValue);
      },
      (error: Error) => {
        withLastError(runtime, error.message, () => {
          callback(undefined);
        });
      },
    );

    return undefined;
  };
}

function createProxiedPort(
  runtime: ChromeNamespace,
  name: string,
  getSenderReport: () => RuntimeProxySenderReport,
) {
  const portId = crypto.randomUUID();

  const onMessage = createEvent();

  const onDisconnect = createEvent();

  let isDisconnected = false;

  let markOpened = () => {};

  /**
   * Resolves once the bridge has answered the connect request. Everything
   * posted before that waits here, since two fetches have no order between
   * them and a message must never overtake the connect that opens its port.
   */
  const opened = new Promise<void>((resolve) => {
    markOpened = resolve;
  });

  let sendChain: Promise<unknown> = opened;

  let cancelFrames = async () => {};

  const port = {
    name,
    onMessage,
    onDisconnect,
    postMessage(message: unknown) {
      if (isDisconnected) {
        throw new Error(DISCONNECTED_PORT_ERROR);
      }

      sendChain = sendChain
        .then(() => postBridge(RUNTIME_PROXY_PATHS.portPost, { portId, message }))
        .then((response) => {
          if (!response.ok) {
            refusePost(response.status);
          }
        })
        .catch(() => undefined);
    },
    disconnect() {
      if (isDisconnected) {
        return;
      }

      isDisconnected = true;

      sendDisconnect();
    },
  };

  // Chrome delivers a port's traffic in order, so the disconnect goes out
  // behind the connect and everything already posted. Sent unchained it
  // overtakes them, and main closes the port before the messages arrive
  const sendDisconnect = () => {
    sendChain = sendChain
      .then(() => postBridge(RUNTIME_PROXY_PATHS.portDisconnect, { portId }))
      .catch(() => undefined)
      // Main closes the port from its stream's `cancel` handler too, which is
      // the backstop for a disconnect request that never landed
      .then(() => cancelFrames())
      .catch(() => undefined);
  };

  // Chrome stays quiet about a port the content script disconnected itself
  const disconnected = (error?: string) => {
    markOpened();

    if (isDisconnected) {
      return;
    }

    isDisconnected = true;

    withLastError(runtime, error, () => {
      onDisconnect.emit(port);
    });
  };

  /**
   * A post the bridge refused, which is what a session at its cap of bodies
   * read at once gets. Chrome has no answer for one message being refused, so
   * this takes the nearest one it has: the port goes away with `lastError`
   * set, and everything posted after it throws. Main has closed nothing on its
   * side — the refusal is settled before the request reaches its handler — so
   * the disconnect still goes out, behind whatever was queued ahead of it, to
   * close the port's record there.
   */
  const refusePost = (status: number) => {
    if (isDisconnected) {
      return;
    }

    disconnected(bridgeAnsweredError(status));

    sendDisconnect();
  };

  const readFrames = async () => {
    const response = await postBridge(RUNTIME_PROXY_PATHS.connect, {
      portId,
      name,
      sender: getSenderReport(),
    });

    if (!response.ok || !response.body) {
      throw new Error(bridgeAnsweredError(response.status));
    }

    markOpened();

    const reader = response.body.getReader();

    cancelFrames = () => reader.cancel();

    const decoder = new NativeMessageDecoder(MAX_RUNTIME_PROXY_FRAME_BYTES);

    for (;;) {
      const { value, done } = await reader.read();

      if (done) {
        return;
      }

      for (const frame of decoder.push(value) as RuntimeProxyPortFrame[]) {
        // A port the content script disconnected hears nothing more, even
        // while the worker's last messages are still on their way. The reader
        // is left open here because `disconnect` cancels it behind its own
        // request
        if (isDisconnected) {
          return;
        }

        if (frame.type === "message") {
          onMessage.emit(frame.message, port);
        } else {
          disconnected(frame.error);

          return;
        }
      }
    }
  };

  readFrames().then(
    () => {
      // The relay closed the stream without a disconnect frame: the far end
      // went away cleanly, which Chrome reports without an error
      disconnected();
    },
    () => {
      // Never opened, exactly like a session with no worker to receive it
      disconnected(RECEIVING_END_ERROR);
    },
  );

  return port;
}

function createProxiedConnect(
  runtime: ChromeNamespace,
  nativeConnect: NativeMethod | undefined,
  getSenderReport: () => RuntimeProxySenderReport,
) {
  return (...callArguments: unknown[]) => {
    const targetExtensionId = typeof callArguments[0] === "string" ? callArguments[0] : undefined;

    if (targetExtensionId !== undefined && targetExtensionId !== runtime.id && nativeConnect) {
      return nativeConnect(...callArguments);
    }

    const connectInfo = (
      typeof callArguments[0] === "object" && callArguments[0] !== null
        ? callArguments[0]
        : callArguments[1]
    ) as { name?: unknown } | undefined;

    return createProxiedPort(
      runtime,
      typeof connectInfo?.name === "string" ? connectInfo.name : "",
      getSenderReport,
    );
  };
}

/**
 * The worker role's derived manifest, as the derive left it on this context's
 * globals. Absent — a shim bundle running outside a derived copy, in a test or
 * from a copy an older derive wrote — means there is nothing better than the
 * native answer to give, so `getManifest` is left alone.
 */
function getEmbeddedWorkerManifest() {
  return (globalThis as unknown as Record<string, unknown>)[RUNTIME_PROXY_MANIFEST_GLOBAL];
}

/**
 * The only keys the worker role's derived manifest and this copy's differ in:
 * `deriveManifest` deletes `background` for the content-script-only role and
 * prepends the shim to every `content_scripts` entry, and leaves the rest of
 * the rewrite the same for both. `deriveManifest`'s own tests pin that, since
 * a third difference would silently stop being answered here.
 */
const WORKER_ROLE_MANIFEST_KEYS = ["background", "content_scripts"];

/**
 * Answers what the one worker's own `getManifest` answers, by laying the two
 * keys the roles differ in over this context's native answer.
 *
 * An overlay rather than the embedded manifest outright, because the native
 * answer is not the manifest file: Chromium localizes a manifest as it loads
 * it — `__MSG_name__` and its siblings substituted out of `_locales`, and a
 * `current_locale` key added — and `getManifest` returns that. 1Password's
 * manifest names itself `__MSG_extName__`, so handing back what the derive
 * wrote would trade the `background` difference for a name and a locale that
 * differ instead. The derive cannot do the substitution itself: the UI locale
 * is a runtime fact of the browser process, not of the copy on disk.
 *
 * Both copies are localized by the same browser process from the same
 * `_locales`, so everything the overlay leaves alone already agrees.
 */
function createProxiedGetManifest(nativeGetManifest: NativeMethod, workerManifest: unknown) {
  return () => {
    const manifest = { ...(nativeGetManifest() as Record<string, unknown>) };

    const workerManifestKeys = workerManifest as Record<string, unknown>;

    for (const manifestKey of WORKER_ROLE_MANIFEST_KEYS) {
      if (workerManifestKeys[manifestKey] === undefined) {
        delete manifest[manifestKey];

        continue;
      }

      manifest[manifestKey] = workerManifestKeys[manifestKey];
    }

    // Chrome hands out a new object per call and says nothing about what an
    // extension may do with it, so an extension that mutates what it got — or
    // that is handed the same object twice and compares the two — must see
    // exactly what it sees in Chrome. The native answer is already fresh; the
    // two keys laid over it are not
    return structuredClone(manifest);
  };
}

export type InstallRuntimeProxyShimOptions = {
  getSenderReport?: () => RuntimeProxySenderReport;
  /**
   * What `getManifest` answers, in place of the one the derive left on the
   * globals. Only tests pass it.
   */
  workerManifest?: unknown;
};

/**
 * Shadows `chrome.runtime.sendMessage` and `chrome.runtime.connect` in a
 * context of a content-script-only session, pointing both at the runtime proxy
 * instead of at this session's own extension instance, which has no service
 * worker to receive them. It runs before any of the extension's own code — the
 * derive prepends it to every `content_scripts` entry and writes it into every
 * extension page ahead of the page's own scripts — so the extension only ever
 * sees the shadowed functions. `getURL` and `id` stay exactly as Electron made
 * them.
 *
 * `getManifest` is shadowed as well, for a different reason: this copy is the
 * one the derive took the `background` key off, so an extension inspecting
 * itself would otherwise find no service worker where the worker session's copy
 * finds one — a per-account difference with nothing behind it, since the worker
 * every session reaches is the same worker. It answers what the worker's own
 * `getManifest` answers, by laying the worker role's `background` and
 * `content_scripts` over this context's native answer rather than replacing it
 * outright; see `createProxiedGetManifest` for why the native answer is the
 * base.
 *
 * `onMessage` and `onConnect` are left native, which is what bounds the shim:
 * an extension page hears what it opened a port for, and not what the worker
 * broadcasts with `sendMessage` to a session it isn't in.
 */
export function installRuntimeProxyShim(
  extensionApi: ChromeNamespace,
  {
    getSenderReport = getContextSenderReport,
    workerManifest = getEmbeddedWorkerManifest(),
  }: InstallRuntimeProxyShimOptions = {},
) {
  const runtime = extensionApi.runtime as ChromeNamespace | undefined;

  if (!runtime) {
    return;
  }

  runtime.sendMessage = createProxiedSendMessage(
    runtime,
    getNativeMethod(runtime, "sendMessage"),
    getSenderReport,
  );

  runtime.connect = createProxiedConnect(
    runtime,
    getNativeMethod(runtime, "connect"),
    getSenderReport,
  );

  const nativeGetManifest = getNativeMethod(runtime, "getManifest");

  // With no native answer to lay the two keys over there is nothing to
  // correct, and a context Chrome gives no `getManifest` must not gain one
  if (workerManifest !== undefined && nativeGetManifest) {
    runtime.getManifest = createProxiedGetManifest(nativeGetManifest, workerManifest);
  }
}
