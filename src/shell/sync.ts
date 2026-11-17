import { useSyncExternalStore } from "react";

import type {
  ShellBridge,
  ShellSliceName,
  ShellState,
} from "#contract/shell.ts";

/**
 * The copy of main's state that the handshake brought and each patch since
 * replaced a slice of; nothing until the snapshot arrives.
 */
export const createShellSync = (
  bridge: Pick<ShellBridge, "sync">,
  slices: readonly ShellSliceName[]
) => {
  let state: Partial<ShellState> = {};
  const listeners = new Set<() => void>();

  bridge.sync(slices, (message) => {
    state =
      message.kind === "snapshot"
        ? message.slices
        : { ...state, [message.slice]: message.value };

    for (const listener of listeners) {
      listener();
    }
  });

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    read: <Name extends ShellSliceName>(slice: Name) => state[slice],
  };
};

declare global {
  interface Window {
    meru: ShellBridge;
  }
}

let connection: ReturnType<typeof createShellSync> | undefined;

const connect = () => {
  connection ??= createShellSync(window.meru, [
    "profiles",
    "tabs",
    "doNotDisturb",
    "overlay",
    "inbox",
  ]);

  return connection;
};

/** A slice of main's state, or nothing until the first snapshot. */
export const useShellState = <Name extends ShellSliceName>(slice: Name) => {
  const { subscribe, read } = connect();

  return useSyncExternalStore(subscribe, () => read(slice));
};

export const shellCalls = () => window.meru.calls;
