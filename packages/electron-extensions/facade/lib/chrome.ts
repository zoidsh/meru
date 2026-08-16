/**
 * The facade never knows what Electron's own `chrome` object holds, so every
 * namespace is treated as an opaque bag of values it may add to.
 */
export type ChromeNamespace = Record<string, unknown>;

export type ChromeEventListener = (...eventArguments: unknown[]) => unknown;

/**
 * Chrome's event shape. The facade's events keep their listeners so
 * `hasListener` answers truthfully and a promoted namespace has them to call,
 * but nothing ever dispatches.
 */
export type ChromeEvent = {
  addListener: (listener: ChromeEventListener, ...eventOptions: unknown[]) => void;
  removeListener: (listener: ChromeEventListener) => void;
  hasListener: (listener: ChromeEventListener) => boolean;
  hasListeners: () => boolean;
};
