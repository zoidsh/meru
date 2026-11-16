import { z } from "zod/mini";

const profileId = z.string().check(z.minLength(1));

const none = z.object({});

/** What the shell renderer may ask of main. Main validates every request. */
export const SHELL_CALLS = {
  selectProfile: { request: z.object({ profileId }), response: z.undefined() },
  addProfile: { request: none, response: z.undefined() },
  /** Pops up the profile's context menu at the pointer. */
  openProfileMenu: {
    request: z.object({ profileId }),
    response: z.undefined(),
  },
} as const;

/** The slices of main's state the shell may subscribe to. */
export const SHELL_STATE = {
  profiles: z.object({
    profiles: z.array(z.object({ id: profileId, name: z.string() })),
    selectedProfileId: profileId,
  }),
} as const;

export type ShellCallName = keyof typeof SHELL_CALLS;

export type ShellCalls = {
  [Name in ShellCallName]: (
    request: z.input<(typeof SHELL_CALLS)[Name]["request"]>
  ) => Promise<z.output<(typeof SHELL_CALLS)[Name]["response"]>>;
};

export type ShellSliceName = keyof typeof SHELL_STATE;

export type ShellState = {
  [Name in ShellSliceName]: z.output<(typeof SHELL_STATE)[Name]>;
};

/** Main to renderer, in order: one snapshot after the handshake, then patches. */
export type ShellSyncMessage =
  | { kind: "snapshot"; slices: Partial<ShellState> }
  | {
      [Name in ShellSliceName]: {
        kind: "patch";
        slice: Name;
        value: ShellState[Name];
      };
    }[ShellSliceName];

/** What the shell's preload exposes on `window.meru`, and nothing else. */
export interface ShellBridge {
  calls: ShellCalls;
  /**
   * Starts the handshake for `slices`; `listener` gets the snapshot, then a
   * patch per change. Returns what stops listening.
   */
  sync: (
    slices: readonly ShellSliceName[],
    listener: (message: ShellSyncMessage) => void
  ) => () => void;
}

export const SHELL_CHANNELS = {
  call: (name: ShellCallName) => `shell:call:${name}`,
  /** Renderer to main: the handshake, naming the slices. */
  sync: "shell:sync",
  /** Main to renderer: each `ShellSyncMessage`. */
  state: "shell:state",
} as const;

export const SHELL_CALL_NAMES = Object.keys(SHELL_CALLS) as ShellCallName[];
