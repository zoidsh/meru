// Apart from the schemas in shell.ts, so the shell's preload, which needs only
// these names, carries no zod.

export const SHELL_CALL_NAMES = [
  "selectProfile",
  "addProfile",
  "openProfileMenu",
  "selectTab",
  "closeTab",
  "retryTab",
  "renameProfile",
  "closeOverlay",
  "toggleDoNotDisturb",
  "openDoNotDisturbMenu",
  "setInboxOpen",
  "openInboxMessage",
  "runInboxAction",
] as const;

export type ShellCallName = (typeof SHELL_CALL_NAMES)[number];

export const SHELL_CHANNELS = {
  call: (name: ShellCallName) => `shell:call:${name}`,
  /** Renderer to main: the handshake, naming the slices. */
  sync: "shell:sync",
  /** Main to renderer: each `ShellSyncMessage`. */
  state: "shell:state",
  /** Main to renderer: a `SoundRequest` to play now. */
  sound: "shell:sound",
} as const;
