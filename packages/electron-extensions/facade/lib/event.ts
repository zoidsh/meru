import type { ChromeEvent, ChromeEventListener } from "./chrome";

/**
 * An event that accepts listeners and never fires. Extensions register their
 * listeners at startup and feature-detect by calling `addListener`, so the
 * shape has to be complete even when nothing behind it exists yet.
 */
export function createNoopEvent(): ChromeEvent {
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
  };
}
