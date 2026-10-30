import type { ChromeNamespace } from "../lib/chrome";
import { createNoopEvent } from "../lib/event";
import { createNoopMethod } from "../lib/method";

/**
 * A noop `webRequest` for the derived copy, which is loaded without the
 * permission (`derive/manifest.ts`) and so has no native namespace: an
 * extension that feature-detects it still finds every event, and requests pass
 * only through the embedder's own `session.webRequest`.
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
