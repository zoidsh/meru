import { findApp } from "./apps.ts";
import type { App } from "./apps.ts";
import { isWebUrl } from "./google-redirect.ts";
import { menuPointInside } from "./overlay.ts";
import { isInSplit } from "./split.ts";
import { isPinned, knownTabs } from "./state.ts";
import type { Profile, State, Tab } from "./state.ts";
import { canCloseTab, closeTab, findTab } from "./tabs.ts";
import type { TabKey } from "./tabs.ts";
import type { Size } from "./window-bounds.ts";

/** Every item a tab's context menu can hold, in the design's order. */
export const TAB_MENU_ITEMS = [
  "sleep",
  "wake",
  "reload",
  "duplicate",
  "copyUrl",
  "openInBrowser",
  "pin",
  "openAtLaunch",
  "splitRight",
  "splitDown",
  "separate",
  "close",
  "closeOthers",
  "closeBelow",
] as const;

export type TabMenuItemId = (typeof TAB_MENU_ITEMS)[number];

/**
 * The menu's groups, drawn with a separator between each; Move to new
 * window's group fits before Close tab's.
 */
export const TAB_MENU_GROUPS: readonly (readonly TabMenuItemId[])[] = [
  ["sleep", "wake"],
  ["reload", "duplicate", "copyUrl", "openInBrowser"],
  ["pin", "openAtLaunch"],
  ["splitRight", "splitDown", "separate"],
  ["close", "closeOthers", "closeBelow"],
];

/** The registry command whose shortcut an item shows, for those that have one. */
export const TAB_MENU_COMMANDS: Partial<Record<TabMenuItemId, string>> = {
  reload: "tab.reload",
  splitRight: "tab.splitRight",
  splitDown: "tab.splitDown",
  close: "tab.close",
};

export interface TabMenuItem {
  id: TabMenuItemId;
  enabled: boolean;
  /** For a checkbox item, whether it is on. */
  checked?: boolean;
}

/** A context menu asked for at a point of the window's content area. */
export interface TabMenuRequest extends TabKey {
  x: number;
  y: number;
}

/** The profile's tabs in the order the sidebar draws them: pinned first. */
const sidebarOrder = (profile: Pick<Profile, "tabs">) => {
  const shown = knownTabs(profile);

  return [
    ...shown.filter((tab) => isPinned(tab)),
    ...shown.filter((tab) => !isPinned(tab)),
  ];
};

const profileOf = (state: State, profileId: string) =>
  state.profiles.find((candidate) => candidate.id === profileId);

/** The tabs Close other tabs closes: every other that can close. */
const othersOf = (profile: Profile, tab: Tab) =>
  knownTabs(profile).filter((other) => other !== tab && canCloseTab(other));

/** The tabs Close tabs below closes: those drawn after it that can close. */
const belowOf = (profile: Profile, tab: Tab) => {
  const order = sidebarOrder(profile);

  return order.slice(order.indexOf(tab) + 1).filter(canCloseTab);
};

/**
 * What the tab's menu offers, in order; nothing for a tab that is not
 * shown. A tab with a page offers Sleep, one without, asleep, Wake; Reload
 * wakes one asleep. Duplicate needs an app that can have more than one tab;
 * a pinned tab has Open at Launch and no Close tab. Split right and Split
 * down split beside the tab, so not beside one outside the profile's split;
 * Separate from split takes one in it out.
 */
export const tabMenuItems = (
  state: State,
  key: TabKey,
  apps: readonly App[],
  loaded: boolean
): TabMenuItem[] | undefined => {
  const profile = profileOf(state, key.profileId);
  const tab = findTab(state, key);

  if (!profile || !tab) {
    return;
  }

  const app = findApp(apps, tab.app);
  const pinned = isPinned(tab);
  const paned = isInSplit(profile, tab.id);
  const splitsBeside = paned || profile.split === undefined;

  return [
    { id: loaded ? "sleep" : "wake", enabled: true },
    { id: "reload", enabled: true },
    { id: "duplicate", enabled: app !== undefined && !app.singleInstance },
    { id: "copyUrl", enabled: true },
    {
      id: "openInBrowser",
      enabled: URL.canParse(tab.url) && isWebUrl(new URL(tab.url)),
    },
    { id: "pin", enabled: true },
    ...(pinned
      ? [
          {
            id: "openAtLaunch" as const,
            enabled: true,
            checked: tab.openAtLaunch === true,
          },
        ]
      : []),
    { id: "splitRight", enabled: splitsBeside },
    { id: "splitDown", enabled: splitsBeside },
    { id: "separate", enabled: paned },
    ...(canCloseTab(tab) ? [{ id: "close" as const, enabled: true }] : []),
    { id: "closeOthers", enabled: othersOf(profile, tab).length > 0 },
    { id: "closeBelow", enabled: belowOf(profile, tab).length > 0 },
  ];
};

/**
 * The menu for a tab asked for at a point, if the tab is shown, of the
 * selected profile, and the point in the content area, in whole CSS pixels.
 */
export const tabMenuAt = (
  state: State,
  request: TabMenuRequest,
  contentSize: Size
): TabMenuRequest | undefined => {
  const { profileId, tabId, x, y } = request;

  return menuPointInside(request, contentSize) &&
    profileId === state.selectedProfileId &&
    findTab(state, { profileId, tabId })
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
