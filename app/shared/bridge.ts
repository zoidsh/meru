import type { Unsubscribe } from "../core/ports.ts";

// contextBridge carries plain values and functions only, so the bridge is untyped transport; the client over it takes the channel objects and parses what comes back.
export interface RendererBridge {
  readonly platform: string;
  readonly send: (channel: string, payload: unknown) => void;
  readonly invoke: (channel: string, payload: unknown) => Promise<unknown>;
  readonly sendSync: (channel: string, payload: unknown) => unknown;
  readonly on: (
    channel: string,
    listener: (payload: unknown) => void
  ) => Unsubscribe;
}

export const BRIDGE_KEY = "meru";
