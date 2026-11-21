// Apart from the schemas, so a preload, which needs only these names, carries
// no zod.

/** The IPC channels of a renderer's contract, under the renderer's prefix. */
export const contractChannels = <CallName extends string>(prefix: string) => ({
  call: (name: CallName) => `${prefix}:call:${name}`,
  /** Renderer to main: the handshake, naming the slices. */
  sync: `${prefix}:sync`,
  /** Main to renderer: each sync message. */
  state: `${prefix}:state`,
});

export type ContractChannels<CallName extends string> = ReturnType<
  typeof contractChannels<CallName>
>;
