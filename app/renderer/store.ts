import { useSyncExternalStore } from "react";
import type { z } from "zod";

import type { Unsubscribe } from "../core/ports.ts";
import type { Result } from "../core/result.ts";
import type {
  IpcError,
  PushChannel,
  SyncChannel,
} from "../shared/channels/define.ts";

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

type NoPayload = z.ZodObject<Record<string, never>>;

/**
 * What a synced store needs of a page's client: a snapshot answered by `R` and a push carrying `P`. A client of any surface that has both channels satisfies it, which is what lets a store serve every page that may read it.
 */
export interface SyncSource<R extends z.ZodType, P extends z.ZodType> {
  readonly sendSync: (
    channel: SyncChannel<NoPayload, R>,
    payload: z.input<NoPayload>
  ) => Result<z.output<R>, IpcError>;
  readonly on: (
    channel: PushChannel<P>,
    listener: (payload: z.output<P>) => void
  ) => Unsubscribe;
}

/**
 * A page's copy of something main holds: seeded once from `snapshot`, `fallback` when that fails, then kept by `push`. A push replaces the copy, or with `follow` is applied to it, as a list of changes is.
 */
export const syncedStore = <
  R extends z.ZodType,
  P extends z.ZodType,
  F = z.output<R>,
>(
  client: SyncSource<R, P>,
  snapshot: SyncChannel<NoPayload, R>,
  push: PushChannel<P>,
  fallback: F,
  follow?: (state: z.output<R> | F, payload: z.output<P>) => z.output<R> | F
): Store<z.output<R> | F> => {
  const seed = client.sendSync(snapshot, {});
  const store = createStore<z.output<R> | F>(seed.ok ? seed.value : fallback);
  client.on(push, (payload) => {
    store.set((state) => {
      if (follow !== undefined) {
        return follow(state, payload);
      }
      const replaced = snapshot.result.safeParse(payload);
      return replaced.success ? replaced.data : state;
    });
  });
  return store;
};

// The selector must return a stable value for an unchanged state, as useSyncExternalStore compares snapshots by identity.
export const useStore = <T, S>(store: Store<T>, select: (state: T) => S): S =>
  useSyncExternalStore(store.subscribe, () => select(store.get()));
