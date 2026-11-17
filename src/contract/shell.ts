import { z } from "zod/mini";

import { MAIL_STATUSES } from "#core/feed.ts";
import { DESIGNS } from "#core/settings.ts";
import { PROFILE_NAME_MAX_LENGTH } from "#core/state.ts";

import type { ShellCallName } from "./shell-channels.ts";

export { SHELL_CALL_NAMES, SHELL_CHANNELS } from "./shell-channels.ts";
export type { ShellCallName } from "./shell-channels.ts";

const profileId = z.string().check(z.minLength(1));

const none = z.object({});

const tabKey = z.object({ profileId, tabId: z.string().check(z.minLength(1)) });

const tabStatus = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unloaded") }),
  z.object({ kind: z.literal("loading") }),
  z.object({ kind: z.literal("live") }),
  z.object({
    kind: z.literal("failed"),
    /** Chromium's error name, such as `ERR_CONNECTION_REFUSED`. */
    reason: z.string(),
    retrying: z.boolean(),
  }),
  z.object({ kind: z.literal("crashed") }),
]);

/** What the shell renderer may ask of main. Main validates every request. */
export const SHELL_CALLS = {
  selectProfile: { request: z.object({ profileId }), response: z.undefined() },
  addProfile: { request: none, response: z.undefined() },
  /** Pops up the profile's context menu at the pointer. */
  openProfileMenu: {
    request: z.object({ profileId }),
    response: z.undefined(),
  },
  selectTab: { request: tabKey, response: z.undefined() },
  closeTab: { request: tabKey, response: z.undefined() },
  /** Loads a tab that failed or crashed again, now. */
  retryTab: { request: tabKey, response: z.undefined() },
  /**
   * Names the profile, from its rename overlay, and closes the overlay; a
   * name left empty or as it was changes nothing.
   */
  renameProfile: {
    request: z.object({
      profileId,
      name: z.string().check(z.maxLength(PROFILE_NAME_MAX_LENGTH)),
    }),
    response: z.undefined(),
  },
  closeOverlay: { request: none, response: z.undefined() },
} as const satisfies Record<
  ShellCallName,
  { request: z.ZodMiniType; response: z.ZodMiniType }
>;

/** The slices of main's state the shell may subscribe to. */
export const SHELL_STATE = {
  profiles: z.object({
    profiles: z.array(
      z.object({
        id: profileId,
        name: z.string(),
        /** What the profile's feed last said; no count until one is read. */
        mail: z.object({
          status: z.enum(MAIL_STATUSES),
          unreadCount: z.nullable(z.int().check(z.nonnegative())),
        }),
      })
    ),
    selectedProfileId: profileId,
  }),
  /** The selected profile's tabs, in the strip's order. */
  tabs: z.object({
    profileId,
    selectedTabId: z.string(),
    tabs: z.array(
      z.object({
        id: z.string(),
        app: z.string(),
        title: z.string(),
        closable: z.boolean(),
        status: tabStatus,
      })
    ),
  }),
  /** The settings the shell draws by, as they apply on this platform. */
  settings: z.object({
    design: z.enum(DESIGNS),
    /** Whether the window's vibrancy shows through the chrome. */
    vibrancy: z.boolean(),
  }),
  /** What the overlay over the content views shows, if anything. */
  overlay: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("none") }),
    z.object({
      kind: z.literal("rename-profile"),
      profileId,
      /** The profile's name as shown, which the field starts with. */
      name: z.string(),
    }),
  ]),
} as const;

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
