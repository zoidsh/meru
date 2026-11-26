import { findApp } from "./apps.ts";
import type { App } from "./apps.ts";
import { menuOfGroups, menuPointInside } from "./context-menu.ts";
import type { MenuEntry, MenuItemEntry, MenuPoint } from "./context-menu.ts";
import { drawnTabs } from "./drawn-tabs.ts";
import { isWebUrl } from "./google-redirect.ts";
import { marksSleepWhenIdle, mayIdleSleep } from "./idle-sleep.ts";
import type { SleepIdleTabs } from "./settings.ts";
import { isInSplit, isMaximized, splitPanes } from "./split.ts";
import { inOwnWindow, isPinned, knownTabs } from "./state.ts";
import type { Profile, State, Tab } from "./state.ts";
import { canCloseTab, canMoveToOwnWindow, closeTab, findTab } from "./tabs.ts";
import type { TabKey } from "./tabs.ts";
import type { Size } from "./window-bounds.ts";

/** Every item a tab's context menu can hold, in the design's order. */
export const TAB_MENU_ITEMS = [
  "sleep",
  "wake",
  "sleepWhenIdle",
  "reload",
  "duplicate",
  "copyUrl",
  "openInBrowser",
  "pin",
  "unpin",
  "openAtLaunch",
  "bookmark",
  "removeBookmark",
  "splitRight",
  "splitDown",
  "maximize",
  "restore",
  "separate",
  "moveToNewWindow",
  "moveToMainWindow",
  "close",
  "closeOthers",
  "closeBelow",
] as const;

export type TabMenuItemId = (typeof TAB_MENU_ITEMS)[number];

/** What More options in a tab's own window holds, in the design's order. */
export const OWN_WINDOW_MENU_ITEMS = [
  "moveToMainWindow",
  "copyUrl",
  "openInBrowser",
] as const satisfies readonly TabMenuItemId[];

export type OwnWindowMenuItemId = (typeof OWN_WINDOW_MENU_ITEMS)[number];

/** A tab's menu asked for at a point of its window's content area. */
export interface TabMenuRequest extends TabKey, MenuPoint {}

/** What the tab's page is now, which some items follow. */
export interface TabPage {
  /** Whether it has a page, else it sleeps. */
  loaded: boolean;
  /**
   * The URL its page shows now, where it has a page; the saved one, which
   * lags behind it, is used otherwise.
   */
  url?: string | undefined;
  /**
   * Whether its page is bookmarked, or `undefined` while it cannot be, as a
   * Gmail, sleeping, loading or failed page.
   */
  bookmarked: boolean | undefined;
}

const profileOf = (state: State, profileId: string) =>
  state.profiles.find((candidate) => candidate.id === profileId);

/** The tabs Close other tabs closes: every other that can close. */
const othersOf = (profile: Profile, tab: Tab) =>
  knownTabs(profile).filter((other) => other !== tab && canCloseTab(other));

/** The tabs Close tabs below closes: those drawn after it that can close. */
const belowOf = (profile: Profile, tab: Tab) => {
  const order = drawnTabs(profile);

  return order.slice(order.indexOf(tab) + 1).filter(canCloseTab);
};

type Item = MenuItemEntry<TabMenuItemId>;

const item = (
  id: TabMenuItemId,
  enabled: boolean,
  more: Pick<Item, "checked" | "command"> = {}
): Item => ({ kind: "item", id, enabled, ...more });

const opensInBrowser = (url: string) =>
  URL.canParse(url) && isWebUrl(new URL(url));

/** Bookmark tab or Remove bookmark, while the page can be bookmarked. */
const bookmarkItems = (bookmarked: boolean | undefined): Item[] =>
  bookmarked === undefined
    ? []
    : [
        item(bookmarked ? "removeBookmark" : "bookmark", true, {
          command: "tab.bookmark",
        }),
      ];

/**
 * The tab's context menu, in the design's groups; nothing for a tab that is
 * not shown. A tab with a page offers Sleep, one without, asleep, Wake;
 * while `sleepIdleTabs` is "chosen", Sleep When Idle follows, a checkbox,
 * for any tab but Gmail's. Reload wakes one asleep. Duplicate needs an app that can have more than
 * one tab; a pinned tab has Unpin, Open at Launch and no Close tab. Bookmark
 * tab or Remove bookmark is there while the page can be bookmarked. Split
 * right and Split down split beside the tab, starting a split where it is in
 * none; Maximize pane, or Restore panes while its split is maximized, and
 * Separate from split take one in a split. A tab that is not pinned can move
 * to a new window; one in its own window offers Move to main window in its
 * place, no Sleep or Wake, since it never sleeps, and neither splitting nor
 * pinning, which are the main window's.
 */
export const tabMenu = (
  state: State,
  key: TabKey,
  apps: readonly App[],
  page: TabPage,
  sleepIdleTabs: SleepIdleTabs
): MenuEntry<TabMenuItemId>[] | undefined => {
  const profile = profileOf(state, key.profileId);
  const tab = findTab(state, key);

  if (!profile || !tab) {
    return;
  }

  const app = findApp(apps, tab.app);
  const pinned = isPinned(tab);
  const own = inOwnWindow(tab);
  const paned = isInSplit(profile, tab.id);
  const asSelected = { ...profile, selectedTabId: tab.id };
  const maximizes = paned && splitPanes(asSelected) !== undefined;

  return menuOfGroups<TabMenuItemId>([
    own
      ? []
      : [
          item(page.loaded ? "sleep" : "wake", true),
          ...(sleepIdleTabs === "chosen" && mayIdleSleep(tab)
            ? [
                item("sleepWhenIdle", true, {
                  checked: marksSleepWhenIdle(tab),
                }),
              ]
            : []),
        ],
    [
      item("reload", true, { command: "tab.reload" }),
      item("duplicate", app !== undefined && !app.singleInstance),
      item("copyUrl", true),
      item("openInBrowser", opensInBrowser(page.url ?? tab.url)),
    ],
    [
      item(pinned ? "unpin" : "pin", !own, { command: "tab.pin" }),
      ...(pinned
        ? [item("openAtLaunch", true, { checked: tab.openAtLaunch === true })]
        : []),
      ...bookmarkItems(page.bookmarked),
    ],
    [
      item("splitRight", !own, { command: "tab.splitRight" }),
      item("splitDown", !own, { command: "tab.splitDown" }),
      item(isMaximized(asSelected) ? "restore" : "maximize", maximizes, {
        command: "tab.maximize",
      }),
      item("separate", paned, { command: "tab.separate" }),
    ],
    [
      own
        ? item("moveToMainWindow", true, { command: "tab.moveToMainWindow" })
        : item("moveToNewWindow", canMoveToOwnWindow(tab), {
            command: "tab.moveToNewWindow",
          }),
    ],
    [
      ...(canCloseTab(tab)
        ? [item("close", true, { command: "tab.close" })]
        : []),
      item("closeOthers", othersOf(profile, tab).length > 0),
      item("closeBelow", belowOf(profile, tab).length > 0),
    ],
  ]);
};

/**
 * More options in the titlebar of the tab's own window: Move to main
 * window, Copy URL and Open in default browser. Open at Launch is left out,
 * since only a pinned tab has it and a pinned tab never moves to a window
 * of its own. Nothing for a tab not in its own window.
 */
export const ownWindowMenu = (
  state: State,
  key: TabKey,
  url?: string
): MenuEntry<OwnWindowMenuItemId>[] | undefined => {
  const tab = findTab(state, key);

  if (!tab || !inOwnWindow(tab)) {
    return;
  }

  return [
    {
      kind: "item",
      id: "moveToMainWindow",
      enabled: true,
      command: "tab.moveToMainWindow",
    },
    { kind: "item", id: "copyUrl", enabled: true },
    {
      kind: "item",
      id: "openInBrowser",
      enabled: opensInBrowser(url ?? tab.url),
    },
  ];
};

/**
 * The menu for a tab asked for at a point, if the tab is shown, of the
 * selected profile or in its own window, and the point in the content
 * area, in whole CSS pixels.
 */
export const tabMenuAt = (
  state: State,
  request: TabMenuRequest,
  contentSize: Size
): TabMenuRequest | undefined => {
  const { profileId, tabId, x, y } = request;
  const tab = findTab(state, { profileId, tabId });

  return menuPointInside(request, contentSize) &&
    tab &&
    (profileId === state.selectedProfileId || inOwnWindow(tab))
    ? { profileId, tabId, x, y }
    : undefined;
};

/**
 * Closes `closing`; where that takes the selected tab, the tab the menu was
 * opened on is selected in its place.
 */
const closeAll = (
  state: State,
  key: TabKey,
  closing: readonly Tab[]
): State | undefined => {
  const selected = profileOf(state, key.profileId)?.selectedTabId;
  let next = state;

  for (const tab of closing) {
    next = closeTab(next, { profileId: key.profileId, tabId: tab.id }) ?? next;
  }

  if (next === state) {
    return;
  }

  return closing.some((tab) => tab.id === selected)
    ? {
        ...next,
        profiles: next.profiles.map((profile) =>
          profile.id === key.profileId
            ? { ...profile, selectedTabId: key.tabId }
            : profile
        ),
      }
    : next;
};

/** Closes every other tab of the profile that can close. */
export const closeOtherTabs = (state: State, key: TabKey) => {
  const profile = profileOf(state, key.profileId);
  const tab = findTab(state, key);

  return profile && tab
    ? closeAll(state, key, othersOf(profile, tab))
    : undefined;
};

/** Closes the tabs the sidebar draws after the tab that can close. */
export const closeTabsBelow = (state: State, key: TabKey) => {
  const profile = profileOf(state, key.profileId);
  const tab = findTab(state, key);

  return profile && tab
    ? closeAll(state, key, belowOf(profile, tab))
    : undefined;
};

/**
 * Where Duplicate puts the copy of `tab`: right after it, or, for a pinned
 * one, at the end of the list, since the copy is not pinned. Returns the id
 * to put it after, or `undefined` to append it.
 */
export const duplicatePlace = (tab: Tab) =>
  isPinned(tab) ? undefined : tab.id;
