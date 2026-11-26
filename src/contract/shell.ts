import { pick } from "es-toolkit";
import { z } from "zod/mini";

import { APP_IDS } from "#core/apps.ts";
import { MAIL_STATUSES } from "#core/feed.ts";
import { FIND_TERM_MAX_LENGTH } from "#core/find.ts";
import { INBOX_ROW_CAP } from "#core/inbox.ts";
import { MAIL_ACTIONS } from "#core/mail-actions.ts";
import { TOAST_MESSAGES } from "#core/overlay.ts";
import { PANE_DIRECTIONS, PANE_GAP_ENDS } from "#core/pane-tree.ts";
import { PROFILE_TINT_STRENGTHS } from "#core/profile-color.ts";
import { SIDEBAR_STATES } from "#core/sidebar.ts";
import { UPDATE_CARD_ACTIONS } from "#core/updates.ts";

import type {
  ContractBridge,
  ContractCalls,
  ContractState,
  SyncMessage,
} from "./contract.ts";
import { SHELL_ENTITLEMENT_CALL_NAMES } from "./entitlement-channels.ts";
import { ENTITLEMENT_CALLS, licenseStanding } from "./entitlement.ts";
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

const bookmarkId = z.string().check(z.minLength(1));

const download = z.object({ id: z.string().check(z.minLength(1)) });

const bytes = z.number().check(z.nonnegative());

/**
 * Whether the tab's page is bookmarked, or `null` while it cannot be, as a
 * Gmail, sleeping, failed or loading tab's.
 */
const bookmarked = z.nullable(z.boolean());

/** A point of the window's content area, in whole CSS pixels. */
const coordinate = z.int().check(z.nonnegative());

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
   * the rest, to just before the tab `before` names, or to the area's end;
   * a tab of a split leaves it on the way.
   */
  moveTab: {
    request: z.object({ profileId, tabId, before: z.optional(tabId) }),
    response: z.undefined(),
  },
  /**
   * Moves a tab of one of the selected profile's split boxes that is not
   * pinned among the box's other such tabs, to just before `before` or after
   * the last, its pane with it.
   */
  moveInBox: {
    request: z.object({ profileId, tabId, before: z.optional(tabId) }),
    response: z.undefined(),
  },
  /**
   * Puts a tab of the selected profile dropped onto `target` in the sidebar
   * in a new pane right of the target's, or shows that there is no room.
   */
  splitOntoTab: {
    request: z.object({ profileId, tabId, target: tabId }),
    response: z.undefined(),
  },
  /**
   * Shows what dropping a tab of the selected profile dragged over the page
   * area, at `point` in it, whose top left is 0, 0, would do there; no
   * point, or one where it would do nothing, shows nothing.
   */
  aimTab: {
    request: z.object({
      profileId,
      tabId,
      // Past the area's left edge in the window's inset, while the sidebar hides.
      point: z.nullable(z.object({ x: z.int(), y: z.int() })),
    }),
    response: z.undefined(),
  },
  /**
   * Drops a tab of the selected profile dragged over the page area at a
   * point in it, splitting a pane or going along the view's edge as
   * `aimTab` showed, and stops showing it.
   */
  dropTab: {
    request: z.object({ profileId, tabId, x: z.int(), y: z.int() }),
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
   * Shows the pane of a tab in one of the profile's splits alone, selecting
   * it, or every pane of its split again, as the box's Restore asks.
   */
  maximizePane: {
    request: z.object({ profileId, tabId, on: z.boolean() }),
    response: z.undefined(),
  },
  /** Loads a tab that failed or crashed again, now. */
  retryTab: { request: tabKey, response: z.undefined() },
  closeOverlay: { request: none, response: z.undefined() },
  /** One of the update card's buttons, which main runs only on a card that offers it. */
  runUpdateCard: {
    request: z.object({ action: z.enum(UPDATE_CARD_ACTIONS) }),
    response: z.undefined(),
  },
  /**
   * The find bar's term as typed, searched for in its page; empty clears
   * it. `tab` names a tab in its own window, whose bar is there; without
   * it, the bar over the main window's page.
   */
  findInPage: {
    request: z.object({
      term: z.string().check(z.maxLength(FIND_TERM_MAX_LENGTH)),
      tab: z.optional(z.object({ profileId, tabId })),
    }),
    response: z.undefined(),
  },
  /** The find bar's next or previous match, wrapping; `tab` as for `findInPage`. */
  findStep: {
    request: z.object({
      forward: z.boolean(),
      tab: z.optional(z.object({ profileId, tabId })),
    }),
    response: z.undefined(),
  },
  /** Escape or Close on the find bar in a tab's own window. */
  closeFind: {
    request: z.object({ profileId, tabId }),
    response: z.undefined(),
  },
  /** Shows the sidebar or hides it, as the titlebar's toggle asks. */
  toggleSidebar: { request: none, response: z.undefined() },
  /** Back, Forward, Reload or Stop on the front tab, as the titlebar asks. */
  navigate: {
    request: z.object({ action: z.enum(NAVIGATE_ACTIONS) }),
    response: z.undefined(),
  },
  /** A tab's own window's titlebar asking the same of its page. */
  navigateTab: {
    request: z.object({ profileId, tabId, action: z.enum(NAVIGATE_ACTIONS) }),
    response: z.undefined(),
  },
  /** Narrows the sidebar or widens it, as its own toggle asks. */
  toggleSidebarWidth: { request: none, response: z.undefined() },
  /** On until turned off, or off, as the titlebar button's click asks. */
  toggleDoNotDisturb: { request: none, response: z.undefined() },
  /**
   * Pops up the Do Not Disturb menu at a point of the content area, which
   * main refuses outside it.
   */
  openDoNotDisturbMenu: {
    request: z.object({ x: coordinate, y: coordinate }),
    response: z.undefined(),
  },
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
  /**
   * Opens the Downloads card, in the main window or in the tab's own window
   * `window` names, moving it there from wherever it was; or closes it.
   */
  setDownloadsOpen: {
    request: z.object({
      open: z.boolean(),
      window: z.optional(z.object({ profileId, tabId })),
    }),
    response: z.undefined(),
  },
  /** Opens a finished download in its default app, closing the card. */
  openDownload: { request: download, response: z.undefined() },
  /** Shows a finished download in its folder. */
  showDownload: { request: download, response: z.undefined() },
  /**
   * Drags a finished download's file out of the card, from the drag the
   * row started and cancelled.
   */
  dragDownload: { request: download, response: z.undefined() },
  cancelDownload: { request: download, response: z.undefined() },
  /** Takes a download off the list; a running one is not. */
  removeDownload: { request: download, response: z.undefined() },
  /** Takes every download off the list but those running. */
  clearDownloads: { request: none, response: z.undefined() },
  /** Opens New tab, the launcher, or closes it, as its buttons ask. */
  toggleOpenApp: { request: none, response: z.undefined() },
  /**
   * Opens a bookmark the open launcher lists, selecting a tab already at
   * its page, and closes the launcher.
   */
  openBookmark: {
    request: z.object({ id: bookmarkId }),
    response: z.undefined(),
  },
  /** Removes a bookmark the open launcher lists, which stays open. */
  removeBookmark: {
    request: z.object({ id: bookmarkId }),
    response: z.undefined(),
  },
  /**
   * Bookmark Tab or Remove Bookmark on the tab's page, as its button in the
   * wide sidebar or its own window's star asks.
   */
  toggleTabBookmark: { request: tabKey, response: z.undefined() },
  /** Opens a tab of an app that the open launcher lists, and closes it. */
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
   * Pops up the tab's context menu at a point of the main window's content
   * area, which main refuses outside it or for a tab that is not shown.
   */
  openTabMenu: {
    request: z.object({ profileId, tabId, x: coordinate, y: coordinate }),
    response: z.undefined(),
  },
  /**
   * Pops up More options at a point of the content area of the tab's own
   * window, which main refuses outside it or for a tab in none.
   */
  openOwnWindowMenu: {
    request: z.object({ profileId, tabId, x: coordinate, y: coordinate }),
    response: z.undefined(),
  },
  /**
   * Pops up a profile button's context menu at a point of the content area,
   * which main refuses outside it or for a profile not listed.
   */
  openProfileMenu: {
    request: z.object({ profileId, x: coordinate, y: coordinate }),
    response: z.undefined(),
  },
  ...pick(ENTITLEMENT_CALLS, SHELL_ENTITLEMENT_CALL_NAMES),
} as const satisfies Record<
  ShellCallName,
  { request: z.ZodMiniType; response: z.ZodMiniType }
>;

/** The slices of main's state the shell may subscribe to. */
export const SHELL_STATE = {
  /** The language Meru shows, as a catalog's tag. */
  language: z.string(),
  /** What the main window shows of Meru Pro, as main decides it. */
  pro: z.object({
    /**
     * The launch waits for the person's choice after the trial ended: the
     * window shows only the trial-ended screen, and no profile has started.
     */
    trialChoice: z.boolean(),
    /**
     * The profile the free version uses, by the name the title bar shows,
     * while others are kept for a license to bring back; else `null`.
     */
    firstProfile: z.nullable(z.string()),
    /** Days to a running trial's last day, which the trial footer counts; `null` with no footer. */
    trialFooterDays: z.nullable(z.number()),
    /** A license request is out, from any window; no second one is sent. */
    licenseRequest: z.boolean(),
    /** What the license notice is worded from. */
    standing: licenseStanding,
  }),
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
        /** Moved to a window of its own, its page there. */
        ownWindow: z.boolean(),
        status: tabStatus,
        bookmarked,
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
     * Each of the profile's splits' boxes in the sidebar, in the splits'
     * order, whichever tab is selected: its tabs in the box's order, and
     * whether the split shows its focused pane alone.
     */
    boxes: z.array(z.object({ tabs: z.array(tabId), maximized: z.boolean() })),
  }),
  /** How the sidebar shows, which also sets where the content view sits. */
  /** The tabs in windows of their own, each its window's titlebar to draw. */
  windows: z.array(
    z.object({
      profileId,
      tabId,
      app: z.string(),
      title: z.string(),
      status: tabStatus,
      navigation: z.object({
        canGoBack: z.boolean(),
        canGoForward: z.boolean(),
        loading: z.boolean(),
      }),
      bookmarked,
      /** The card open in it, drawn over the page, one at a time. */
      card: z.nullable(
        z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("downloads") }),
        ])
      ),
      /** Its find bar while it is open, drawn over the page in that window. */
      find: z.nullable(
        z.object({
          term: z.string(),
          ordinal: z.int().check(z.nonnegative()),
          matches: z.int().check(z.nonnegative()),
          opened: z.int().check(z.nonnegative()),
        })
      ),
    })
  ),
  sidebar: z.object({ state: z.enum(SIDEBAR_STATES) }),
  /** What the Appearance settings ask of the shell. */
  appearance: z.object({
    /** Whether the shell mixes the profile's colour into its greys. */
    tint: z.boolean(),
    /** How much of it, `styles.css` holding the percentage per theme. */
    tintStrength: z.enum(PROFILE_TINT_STRENGTHS),
    /**
     * Whether each titlebar button may show; one that may still shows only
     * where it otherwise would.
     */
    buttons: z.object({
      /**
       * Whether the Sidebar button may show: not on the free version,
       * which has the Gmail tab alone and so no sidebar to toggle.
       */
      sidebar: z.boolean(),
      newTab: z.boolean(),
      unifiedInbox: z.boolean(),
      downloads: z.boolean(),
      /** Hidden only while Do Not Disturb is off. */
      doNotDisturb: z.boolean(),
    }),
  }),
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
  /**
   * Downloads: what the titlebar's button shows, and the list, newest
   * first, sent only while the card is open, in the main window or in the
   * tab's own window `window` names.
   */
  downloads: z.object({
    open: z.boolean(),
    window: z.nullable(z.object({ profileId, tabId })),
    button: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("plain") }),
      /** One finished since the card was last opened, and nothing runs. */
      z.object({ kind: z.literal("finished") }),
      /** The share of everything running, `null` while a size is not known. */
      z.object({
        kind: z.literal("running"),
        progress: z.nullable(z.number().check(z.gte(0), z.lte(1))),
      }),
    ]),
    rows: z.array(
      z.object({
        id: z.string().check(z.minLength(1)),
        fileName: z.string(),
        /** `gone` is a finished one whose file is no longer where it landed. */
        state: z.enum([
          "progressing",
          "completed",
          "failed",
          "cancelled",
          "gone",
        ]),
        received: bytes,
        /** 0 while not known. */
        total: bytes,
        /** In milliseconds since the epoch. */
        startedAt: z.number(),
      })
    ),
  }),
  /** What the overlay over the content views shows, if anything. */
  overlay: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("none") }),
    z.object({ kind: z.literal("inbox") }),
    z.object({ kind: z.literal("downloads") }),
    /** Meru Pro ends at the next launch, or the license could not be confirmed. */
    z.object({ kind: z.literal("license") }),
    /** A version ready to install, or one that could not be verified. */
    z.object({
      kind: z.literal("update"),
      card: z.enum(["ready", "unverified"]),
      version: z.string().check(z.minLength(1)),
    }),
    z.object({
      kind: z.literal("open-app"),
      profileId,
      /** What the profile can open, in the registry's order. */
      apps: z.array(z.object({ id: z.enum(APP_IDS), name: z.string() })),
      /** The profile's bookmarks, in the order they were saved. */
      bookmarks: z.array(
        z.object({
          id: bookmarkId,
          title: z.string(),
          app: z.enum(APP_IDS),
          /** The app's name, beside the title. */
          appName: z.string(),
        })
      ),
      /** Open in split, putting the pick that way of the focused pane. */
      split: z.nullable(z.enum(PANE_DIRECTIONS)),
    }),
    /** A short notice, which takes no focus and closes by itself. */
    z.object({
      kind: z.literal("toast"),
      message: z.enum(TOAST_MESSAGES),
      /** The page a bookmark notice names. */
      title: z.nullable(z.string()),
    }),
    /**
     * What a tab dragged over the page area would do: the zone that lights
     * up, in the page area, which the overlay's view covers; whether it
     * splits a pane or goes along the view's edge; and whether every pane
     * would keep its minimum, without which it does nothing.
     */
    z.object({
      kind: z.literal("drop"),
      x: coordinate,
      y: coordinate,
      width: coordinate,
      height: coordinate,
      along: z.enum(["pane", "edge"]),
      fits: z.boolean(),
    }),
    /** The find bar over the tab's page, the focused pane's in a split. */
    z.object({
      kind: z.literal("find"),
      profileId,
      tabId,
      term: z.string(),
      /** The match shown, 1-based; 0 with none. */
      ordinal: z.int().check(z.nonnegative()),
      matches: z.int().check(z.nonnegative()),
      /** Changes on each open, which selects the field's text again. */
      opened: z.int().check(z.nonnegative()),
    }),
  ]),
} as const;

export type ShellCalls = ContractCalls<typeof SHELL_CALLS>;

export type ShellSliceName = keyof typeof SHELL_STATE;

export type ShellState = ContractState<typeof SHELL_STATE>;

export type ShellSyncMessage = SyncMessage<ShellState>;

/** What the shell's preload exposes on `window.meru`, and nothing else. */
export interface ShellBridge extends ContractBridge<ShellCalls, ShellState> {
  /**
   * `listener` gets each sound main asks for, unchecked, which
   * `soundRequestSchema` validates. Returns what stops listening.
   */
  onSound: (listener: (request: unknown) => void) => () => void;
}
