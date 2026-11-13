import { useSyncExternalStore } from "react";

export interface Store<T> {
  readonly get: () => T;
  readonly set: (update: (state: T) => T) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export const createStore = <T>(initial: T): Store<T> => {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => state,
    set: (update) => {
      const next = update(state);
      if (Object.is(next, state)) {
        return;
      }
      state = next;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

// The selector must return a stable value for an unchanged state, as useSyncExternalStore compares snapshots by identity.
export const useStore = <T, S>(store: Store<T>, select: (state: T) => S): S =>
  useSyncExternalStore(store.subscribe, () => select(store.get()));
