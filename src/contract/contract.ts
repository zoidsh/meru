import type { z } from "zod/mini";

/**
 * The shape every renderer's contract shares: calls the renderer makes, each
 * with a request main validates, and state slices main sends it.
 */
export type CallSchemas = Record<
  string,
  { request: z.ZodMiniType; response: z.ZodMiniType }
>;

export type SliceSchemas = Record<string, z.ZodMiniType>;

export type ContractCalls<Calls extends CallSchemas> = {
  [Name in keyof Calls]: (
    request: z.input<Calls[Name]["request"]>
  ) => Promise<z.output<Calls[Name]["response"]>>;
};

export type ContractState<Slices extends SliceSchemas> = {
  [Name in keyof Slices]: z.output<Slices[Name]>;
};

/** Main to renderer, in order: one snapshot after the handshake, then patches. */
export type SyncMessage<State> =
  | { kind: "snapshot"; slices: Partial<State> }
  | {
      [Name in keyof State]: {
        kind: "patch";
        slice: Name;
        value: State[Name];
      };
    }[keyof State];

/** What a renderer's preload exposes for its contract. */
export interface ContractBridge<Calls, State> {
  calls: Calls;
  /**
   * Starts the handshake for `slices`; `listener` gets the snapshot, then a
   * patch per change. Returns what stops listening.
   */
  sync: (
    slices: readonly (keyof State & string)[],
    listener: (message: SyncMessage<State>) => void
  ) => () => void;
}
