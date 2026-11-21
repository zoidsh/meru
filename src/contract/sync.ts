import type { ContractBridge, SyncMessage } from "./contract.ts";

/**
 * A renderer's copy of main's state that the handshake brought and each patch
 * since replaced a slice of; nothing until the snapshot arrives.
 */
export const createContractSync = <State>(
  bridge: Pick<ContractBridge<unknown, State>, "sync">,
  slices: readonly (keyof State & string)[]
) => {
  let state: Partial<State> = {};
  const listeners = new Set<() => void>();

  bridge.sync(slices, (message: SyncMessage<State>) => {
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
    read: <Name extends keyof State>(slice: Name) => state[slice],
  };
};
