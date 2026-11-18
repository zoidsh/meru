import { z } from "zod/mini";

import { APP_IDS } from "#core/apps.ts";
import { MAIL_STATUSES } from "#core/feed.ts";
import { INBOX_ROW_CAP } from "#core/inbox.ts";
import { MAIL_ACTIONS } from "#core/mail-actions.ts";
import { TOAST_MESSAGES } from "#core/overlay.ts";
import { PANE_DIRECTIONS, PANE_GAP_ENDS } from "#core/pane-tree.ts";
import { PROFILE_MENU_ITEMS } from "#core/profile-menu.ts";
import { SIDEBAR_STATES } from "#core/sidebar.ts";
import { PROFILE_NAME_MAX_LENGTH } from "#core/state.ts";
import { TAB_MENU_ITEMS } from "#core/tab-menu.ts";

import { NAVIGATE_ACTIONS } from "./shell-channels.ts";
import type { ShellCallName } from "./shell-channels.ts";

export { SHELL_CALL_NAMES, SHELL_CHANNELS } from "./shell-channels.ts";
export type { ShellCallName } from "./shell-channels.ts";

const profileId = z.string().check(z.minLength(1));

const none = z.object({});

/** A Gmail message id as the feed's link carries it, lowercase hex. */
const messageId = z.string().check(z.regex(/^[\da-f]{1,32}$/u));

const inboxMessage = z.object({ profileId, messageId });

const mailStatus = z.enum(MAIL_STATUSES);

const unreadCount = z.nullable(z.int().check(z.nonnegative()));

const tabId = z.string().check(z.minLength(1));

const tabKey = z.object({ profileId, tabId });

/** A point of the window's content area, in whole CSS pixels. */
const coordinate = z.int().check(z.nonnegative());

const tabMenuItem = z.enum(TAB_MENU_ITEMS);

const profileMenuItem = z.enum(PROFILE_MENU_ITEMS);

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
  selectTab: { request: tabKey, response: z.undefined() },
  closeTab: { request: tabKey, response: z.undefined() },
  /**
   * Moves a tab of the selected profile within its area, the pinned tabs or
   * the rest, to just before the tab `before` names, or to the area's end.
   */
  moveTab: {
    request: z.object({ profileId, tabId, before: z.optional(tabId) }),
    response: z.undefined(),
  },
  /**
   * Moves the gap between the selected profile's panes of `before` and
   * `after`, the first tabs on each side of it, `by` pixels from where it
   * stood when the gesture began; each move places the pages, and the last,
   * `done`, is stored.
   */
  resizePanes: {
    request: z.object({
      before: tabId,
      after: tabId,
      by: z.int(),
      /** In place of `by`, Home's and End's: to the least or most it may be. */
      to: z.optional(z.enum(PANE_GAP_ENDS)),
      gesture: z.int().check(z.nonnegative()),
      done: z.boolean(),
    }),
    response: z.undefined(),
  },
  /** Gives the split where the two panes part equal shares. */
  evenOutPanes: {
    request: z.object({ before: tabId, after: tabId }),
    response: z.undefined(),
  },
  /**
   * Shows the pane of a tab in the profile's split alone, selecting it, or
   * every pane again, as the box's Restore asks.
   */
  maximizePane: {
    request: z.object({ profileId, tabId, on: z.boolean() }),
    response: z.undefined(),
  },
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
  /** Shows the sidebar or hides it, as the titlebar's toggle asks. */
  toggleSidebar: { request: none, response: z.undefined() },
  /** Back, Forward, Reload or Stop on the front tab, as the titlebar asks. */
  navigate: {
    request: z.object({ action: z.enum(NAVIGATE_ACTIONS) }),
    response: z.undefined(),
  },
  /** Narrows the sidebar or widens it, as its own toggle asks. */
  toggleSidebarWidth: { request: none, response: z.undefined() },
  /** On until turned off, or off, as the titlebar button's click asks. */
  toggleDoNotDisturb: { request: none, response: z.undefined() },
  /** Pops up the Do Not Disturb menu at the pointer. */
  openDoNotDisturbMenu: { request: none, response: z.undefined() },
  /** Opens the unified inbox's overlay, or closes it. */
  setInboxOpen: {
    request: z.object({ open: z.boolean() }),
    response: z.undefined(),
  },
  /**
   * Opens a message the inbox lists in its profile's Gmail tab; main takes
   * the link from its own copy of the feed, never from the shell.
   */
  openInboxMessage: { request: inboxMessage, response: z.undefined() },
  /** Runs an action on a message the inbox lists. */
  runInboxAction: {
    request: z.object({
      profileId,
      messageId,
      action: z.enum(MAIL_ACTIONS),
    }),
    response: z.undefined(),
  },
  /** Opens Open app, or closes it, as its buttons ask. */
  toggleOpenApp: { request: none, response: z.undefined() },
  /** Opens a tab of an app that the open Open app lists, and closes it. */
  openApp: {
    request: z.object({ appId: z.enum(APP_IDS) }),
    response: z.undefined(),
  },
  /**
   * Selects the profile's Gmail, opening it at its home where it was closed,
   * which Google sends to its sign-in page while the account is signed out.
   */
  openGmail: { request: z.object({ profileId }), response: z.undefined() },
  /**
   * Opens the tab's context menu at a point of the content area, which main
   * refuses outside it or for a tab that is not shown.
   */
  openTabMenu: {
    request: z.object({ profileId, tabId, x: coordinate, y: coordinate }),
    response: z.undefined(),
  },
  /** Runs an item of the open tab menu on its tab, and closes the menu. */
  runTabMenuItem: {
    request: z.object({ item: tabMenuItem }),
    response: z.undefined(),
  },
  /**
   * Opens a profile button's context menu at a point of the content area,
   * which main refuses outside it or for a profile not listed.
   */
  openProfileMenu: {
    request: z.object({ profileId, x: coordinate, y: coordinate }),
    response: z.undefined(),
  },
  /** Runs an item of the open profile menu on its profile, and closes the menu. */
  runProfileMenuItem: {
    request: z.object({ item: profileMenuItem }),
    response: z.undefined(),
  },
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
        /** The profile's colour as CSS, for its dot and the shell's tint. */
        color: z.string(),
        /** What the profile's feed last said; no count until one is read. */
        mail: z.object({ status: mailStatus, unreadCount }),
        /** Put to sleep: no pages, its mail still checked. */
        asleep: z.boolean(),
      })
    ),
    selectedProfileId: profileId,
  }),
  /** The selected profile's tabs, in the strip's order. */
  tabs: z.object({
    profileId,
    selectedTabId: z.string(),
    /**
     * Whether the selected tab was put to sleep while selected, so the page
     * area shows the sleeping pane; a tab selected while unloaded is loading.
     */
    selectedAsleep: z.boolean(),
    tabs: z.array(
      z.object({
        id: z.string(),
        app: z.string(),
        title: z.string(),
        /** Drawn in the pinned area, with no close button. */
        pinned: z.boolean(),
        status: tabStatus,
      })
    ),
    /**
     * While the selected tab is in its profile's split, every pane, each
     * where it sits in the page area, whose top left is 0, 0; the selected
     * tab's pane has focus. `null` while a tab shows alone.
     */
    panes: z.nullable(
      z.array(
        z.object({
          tabId,
          x: coordinate,
          y: coordinate,
          width: coordinate,
          height: coordinate,
          /** Put to sleep: the pane shows the sleeping placeholder. */
          asleep: z.boolean(),
        })
      )
    ),
    /**
     * Each gap between the panes on screen, in the page area: the first tab
     * on each side, which name it to `resizePanes`, the way it moves, and
     * the length before it with the least and most that may become.
     */
    handles: z.array(
      z.object({
        before: tabId,
        after: tabId,
        direction: z.enum(PANE_DIRECTIONS),
        x: coordinate,
        y: coordinate,
        width: coordinate,
        height: coordinate,
        size: coordinate,
        /** The two panes' lengths together, of which `size` is the first's. */
        span: coordinate,
        minimum: coordinate,
        maximum: coordinate,
      })
    ),
    /**
     * The profile's split's tabs, in the order of its box in the sidebar,
     * whichever tab is selected; `null` without a split.
     */
    box: z.nullable(z.array(tabId)),
    /** Whether the split shows its focused pane alone. */
    maximized: z.boolean(),
  }),
  /** How the sidebar shows, which also sets where the content view sits. */
  sidebar: z.object({ state: z.enum(SIDEBAR_STATES) }),
  /**
   * Each command's shortcut on this platform as a person reads it, such as
   * `⌘S`, by command id; a command with none is absent.
   */
  shortcuts: z.record(z.string(), z.string()),
  /**
   * The same shortcuts as `aria-keyshortcuts` names them, such as
   * `Shift+Meta+W`, by command id.
   */
  ariaShortcuts: z.record(z.string(), z.string()),
  /**
   * Where the front tab's page can go and whether it is loading, for the
   * titlebar's Back, Forward and Reload; `null` with no front tab or under
   * the unified inbox.
   */
  navigation: z.nullable(
    z.object({
      canGoBack: z.boolean(),
      canGoForward: z.boolean(),
      loading: z.boolean(),
    })
  ),
  /** Whether Do Not Disturb holds, and until when: `null` for until turned off. */
  doNotDisturb: z.object({
    on: z.boolean(),
    until: z.nullable(z.number()),
  }),
  /**
   * The unified inbox, open while its overlay is. Its profiles and rows are
   * sent only while it is open, so what mail says leaves main only while
   * someone looks at it.
   */
  inbox: z.object({
    open: z.boolean(),
    /** Every profile, with what its feed last said and how many it listed. */
    profiles: z.array(
      z.object({
        id: profileId,
        name: z.string(),
        status: mailStatus,
        unreadCount,
        listed: z.int().check(z.nonnegative()),
      })
    ),
    /** Newest first across profiles; text from the feed, shown as text. */
    rows: z
      .array(
        z.object({
          profileId,
          messageId,
          senderName: z.string(),
          senderAddress: z.string(),
          subject: z.string(),
          summary: z.string(),
          /** When it arrived, in milliseconds since the epoch. */
          issued: z.number(),
        })
      )
      .check(z.maxLength(INBOX_ROW_CAP)),
    /** The last action that failed and was put back, until the next or a close. */
    notice: z.nullable(
      z.object({
        action: z.enum(MAIL_ACTIONS),
        profileId,
        reason: z.enum(["failed", "signedOut"]),
      })
    ),
  }),
  /** What the overlay over the content views shows, if anything. */
  overlay: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("none") }),
    z.object({ kind: z.literal("inbox") }),
    z.object({
      kind: z.literal("rename-profile"),
      profileId,
      /** The profile's name as shown, which the field starts with. */
      name: z.string(),
    }),
    z.object({
      kind: z.literal("open-app"),
      profileId,
      /** What the profile can open, in the registry's order. */
      apps: z.array(z.object({ id: z.enum(APP_IDS), name: z.string() })),
      /** Open in split, putting the pick that way of the focused pane. */
      split: z.nullable(z.enum(PANE_DIRECTIONS)),
    }),
    /** A short notice, which takes no focus and closes by itself. */
    z.object({
      kind: z.literal("toast"),
      message: z.enum(TOAST_MESSAGES),
    }),
    z.object({
      kind: z.literal("tab-menu"),
      profileId,
      tabId,
      /** Where it was asked for, in the content area, which the menu's view covers. */
      x: coordinate,
      y: coordinate,
      /** The tab's title, which names the menu. */
      title: z.string(),
      pinned: z.boolean(),
      /** What it offers, in order. */
      items: z.array(
        z.object({
          id: tabMenuItem,
          enabled: z.boolean(),
          checked: z.optional(z.boolean()),
        })
      ),
    }),
    z.object({
      kind: z.literal("profile-menu"),
      profileId,
      /** Where it was asked for, in the content area, which the menu's view covers. */
      x: coordinate,
      y: coordinate,
      /** The profile's name as shown, which names the menu. */
      title: z.string(),
      /** What it offers, in order. */
      items: z.array(z.object({ id: profileMenuItem, enabled: z.boolean() })),
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
  /**
   * `listener` gets each sound main asks for, unchecked, which
   * `soundRequestSchema` validates. Returns what stops listening.
   */
  onSound: (listener: (request: unknown) => void) => () => void;
}
