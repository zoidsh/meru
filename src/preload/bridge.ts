import { ipcRenderer } from "electron";

import type { ContractChannels } from "#contract/channels.ts";
import type { ContractBridge, SyncMessage } from "#contract/contract.ts";

/** A contract's calls and state sync, over its channels, for a preload to expose. */
export const contractBridge = <Calls, State>(
  names: readonly (keyof Calls & string)[],
  channels: ContractChannels<keyof Calls & string>
): ContractBridge<Calls, State> => ({
  calls: Object.fromEntries(
    names.map((name) => [
      name,
      (request: unknown) => ipcRenderer.invoke(channels.call(name), request),
    ])
  ) as Calls,
  sync: (slices, listener) => {
    const receive = (_event: unknown, message: SyncMessage<State>) => {
      listener(message);
    };

    // Listening before the handshake, so nothing main sends is missed.
    ipcRenderer.on(channels.state, receive);
    ipcRenderer.send(channels.sync, slices);

    return () => {
      ipcRenderer.off(channels.state, receive);
    };
  },
});
