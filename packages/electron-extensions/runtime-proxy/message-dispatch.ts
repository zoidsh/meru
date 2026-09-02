import type { ChromeEventListener, ChromeNamespace } from "../facade/lib/chrome";
import type { RuntimeProxySender, RuntimeProxySendMessageResult } from "./bridge-protocol";

/**
 * Chrome's `onMessage` dispatch and its aggregation, shared by the two sides
 * that have to reproduce it: the worker's relay client, for what a shimmed
 * context sent, and the shim's page-stream client, for what the worker sent.
 *
 * Both also have to know which listeners the extension registered, which the
 * native event will not tell them, so both wrap the event and mirror its
 * listeners here while leaving every listener registered natively too.
 */

/**
 * Wraps a native event with one that also mirrors its listeners. The native
 * event keeps every listener, so whatever dispatches natively — in-session
 * messaging in the worker's own session, above all — dispatches exactly as
 * before.
 */
export function mirrorEvent(
  runtime: ChromeNamespace,
  eventName: string,
  mirroredListeners: Set<ChromeEventListener>,
  logLabel: string,
) {
  const nativeEvent = runtime[eventName] as
    | {
        addListener?: (listener: ChromeEventListener, ...eventOptions: unknown[]) => void;
        removeListener?: (listener: ChromeEventListener) => void;
        hasListener?: (listener: ChromeEventListener) => boolean;
        hasListeners?: () => boolean;
      }
    | undefined;

  const wrappedEvent = {
    addListener(listener: ChromeEventListener, ...eventOptions: unknown[]) {
      mirroredListeners.add(listener);

      nativeEvent?.addListener?.(listener, ...eventOptions);
    },
    removeListener(listener: ChromeEventListener) {
      mirroredListeners.delete(listener);

      nativeEvent?.removeListener?.(listener);
    },
    hasListener(listener: ChromeEventListener) {
      return mirroredListeners.has(listener);
    },
    hasListeners() {
      return mirroredListeners.size > 0;
    },
  };

  runtime[eventName] = wrappedEvent;

  if (runtime[eventName] !== wrappedEvent) {
    console.error(`[${logLabel}] could not wrap runtime.${eventName}`);
  }
}

/**
 * Chrome's dispatch, reproduced: every listener hears the message, the first
 * `sendResponse` wins, and a listener returning `true` keeps the channel open
 * for an answer that comes later. No listener at all is the "receiving end does
 * not exist" case, and listeners that all decline to answer close the channel
 * the way Chrome's message port closes.
 */
export function dispatchMessage(
  listeners: Set<ChromeEventListener>,
  message: unknown,
  sender: RuntimeProxySender,
  logLabel: string,
): Promise<RuntimeProxySendMessageResult> {
  if (listeners.size === 0) {
    return Promise.resolve({ status: "noListener" });
  }

  return new Promise((resolve) => {
    let isDone = false;

    let expectsAsyncResponse = false;

    const sendResponse = (response?: unknown) => {
      if (isDone) {
        return;
      }

      isDone = true;

      resolve({ status: "replied", reply: response });
    };

    for (const listener of listeners) {
      try {
        if (listener(message, sender, sendResponse) === true) {
          expectsAsyncResponse = true;
        }
      } catch (error) {
        console.error(`[${logLabel}] onMessage listener threw`, error);
      }
    }

    if (!isDone && !expectsAsyncResponse) {
      isDone = true;

      resolve({ status: "closed" });
    }
  });
}

/**
 * One message's outcome across the several places it was delivered — the frames
 * of a tab, or the extension's pages — aggregated the way Chrome aggregates a
 * multi-frame `tabs.sendMessage`: the first `sendResponse` to arrive wins,
 * whichever frame it came from; failing that, a frame that took the message and
 * never answered closes the message port; and only when no frame had a listener
 * at all is there no receiving end.
 *
 * The first reply is first in time rather than first in the list, which is what
 * Chrome does and what a fan-out where one frame answers instantly and another
 * waits on a biometric prompt needs.
 */
export function firstReply(
  deliveries: Promise<RuntimeProxySendMessageResult>[],
): Promise<RuntimeProxySendMessageResult> {
  if (deliveries.length === 0) {
    return Promise.resolve({ status: "noListener" });
  }

  return new Promise((resolve) => {
    let pendingCount = deliveries.length;

    let hadListener = false;

    let isSettled = false;

    const settle = (result: RuntimeProxySendMessageResult) => {
      if (isSettled) {
        return;
      }

      isSettled = true;

      resolve(result);
    };

    for (const delivery of deliveries) {
      void delivery.then((result) => {
        if (result.status === "replied") {
          settle(result);

          return;
        }

        if (result.status === "closed") {
          hadListener = true;
        }

        pendingCount -= 1;

        if (pendingCount === 0) {
          settle({ status: hadListener ? "closed" : "noListener" });
        }
      });
    }
  });
}
