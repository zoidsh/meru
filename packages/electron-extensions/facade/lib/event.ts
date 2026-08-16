import type { ChromeEvent, ChromeEventListener } from "./chrome";

export type EmittableChromeEvent = ChromeEvent & {
  emit: (...eventArguments: unknown[]) => void;
};

/**
 * Chrome's event shape, with a way to dispatch. A listener that throws is the
 * extension's problem and never the event's: the rest still hear about it.
 */
export function createEvent(): EmittableChromeEvent {
  const listeners = new Set<ChromeEventListener>();

  return {
    addListener(listener) {
      listeners.add(listener);
    },
    removeListener(listener) {
      listeners.delete(listener);
    },
    hasListener(listener) {
      return listeners.has(listener);
    },
    hasListeners() {
      return listeners.size > 0;
    },
    emit(...eventArguments) {
      for (const listener of listeners) {
        try {
          listener(...eventArguments);
        } catch (error) {
          console.error("[chrome-facade] event listener threw", error);
        }
      }
    },
  };
}

/**
 * An event that accepts listeners and never fires. Extensions register their
 * listeners at startup and feature-detect by calling `addListener`, so the
 * shape has to be complete even when nothing behind it exists yet.
 */
export function createNoopEvent(): ChromeEvent {
  const { emit: _emit, ...event } = createEvent();

  return event;
}
