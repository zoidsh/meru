import type { ChromeNamespace } from "../lib/chrome";
import { createNoopEvent } from "../lib/event";
import { createNoopMethod } from "../lib/method";

/**
 * The namespace Electron declares but cannot serve: its extension bindings ship
 * no `webRequest` module, so every event on it is declared-but-`undefined` —
 * feature detection with `in` passes and the dereference that follows takes the
 * service worker down. Filling the events keeps that from happening; requests
 * still only pass through the embedder's own `session.webRequest`.
 */
export function createWebRequest(): ChromeNamespace {
  return {
    MAX_HANDLER_BEHAVIOR_CHANGED_CALLS_PER_10_MINUTES: 20,

    handlerBehaviorChanged: createNoopMethod(() => undefined),

    onBeforeRequest: createNoopEvent(),
    onBeforeSendHeaders: createNoopEvent(),
    onSendHeaders: createNoopEvent(),
    onHeadersReceived: createNoopEvent(),
    onAuthRequired: createNoopEvent(),
    onResponseStarted: createNoopEvent(),
    onBeforeRedirect: createNoopEvent(),
    onCompleted: createNoopEvent(),
    onErrorOccurred: createNoopEvent(),
    onActionIgnored: createNoopEvent(),
  };
}
