// Apart from the schemas in shell.ts, so the shell's preload, which needs only
// these names, carries no zod.

export const SHELL_CALL_NAMES = [
  "selectProfile",
  "selectTab",
  "closeTab",
  "moveTab",
  "retryTab",
  "renameProfile",
  "closeOverlay",
  "toggleSidebar",
  "navigate",
  "toggleSidebarWidth",
  "toggleDoNotDisturb",
  "openDoNotDisturbMenu",
  "setInboxOpen",
  "openInboxMessage",
  "runInboxAction",
  "toggleOpenApp",
  "openApp",
  "openGmail",
  "openTabMenu",
  "runTabMenuItem",
] as const;

/** What the titlebar's navigation buttons ask of the front tab. */
export const NAVIGATE_ACTIONS = ["back", "forward", "reload", "stop"] as const;

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
