import { isEqual } from "es-toolkit";

import type { Platform } from "./platform.ts";
import { isPinned, knownTabs, selectedProfile } from "./state.ts";
import type { State, Tab } from "./state.ts";
import { titlebarStart } from "./titlebar.ts";

export const SIDEBAR_STATES = ["hidden", "narrow", "wide"] as const;

export type SidebarState = (typeof SIDEBAR_STATES)[number];

const WIDTHS: Record<SidebarState, number> = {
  hidden: 0,
  narrow: 64,
  wide: 224,
};

/**
 * Narrow, as wide as the titlebar's start, so the page's left edge lines up
 * with the sidebar toggle above it. Where the toggle sits at the window's
 * edge, on Windows and Linux, that would leave no column, so it keeps 64.
 */
export const sidebarWidth = (state: SidebarState, platform: Platform) =>
  state === "narrow"
    ? Math.max(WIDTHS.narrow, titlebarStart(platform))
    : WIDTHS[state];

/** A narrow tile's size, which the narrow column centres. */
export const NARROW_TILE = 32;

/**
 * What the person chose by hand: shown or hidden by the titlebar's toggle,
 * narrow or wide by the sidebar's own. Held until the tabs change.
 */
export interface SidebarOverride {
  shown?: boolean;
  width?: "narrow" | "wide";
}

/**
 * Hidden for one tab or none, wide while some app has two or more tabs that
 * are not pinned, narrow otherwise.
 */
export const sidebarRule = (tabs: readonly Tab[]): SidebarState => {
  if (tabs.length <= 1) {
    return "hidden";
  }

  const unpinned = tabs.filter((tab) => !isPinned(tab));
  const apps = new Set(unpinned.map((tab) => tab.app));

  return apps.size < unpinned.length ? "wide" : "narrow";
};

/** The rule, as the person's choices override it; shown by hand, at least narrow. */
export const sidebarState = (
  tabs: readonly Tab[],
  override: SidebarOverride
): SidebarState => {
  const rule = sidebarRule(tabs);

  if (override.shown === false || (rule === "hidden" && !override.shown)) {
    return "hidden";
  }

  return override.width ?? (rule === "hidden" ? "narrow" : rule);
};

/** The selected profile's tabs, which the rule reads. */
export const sidebarTabs = (state: State) => knownTabs(selectedProfile(state));

const tabIds = (state: State) =>
  sidebarTabs(state)
    .map((tab) => tab.id)
    .toSorted();

/**
 * Whether a choice made by hand still holds after `previous` became `next`:
 * not once another profile is selected or a tab opens or closes in it.
 */
export const keepsOverride = (previous: State, next: State) =>
  previous.selectedProfileId === next.selectedProfileId &&
  isEqual(tabIds(previous), tabIds(next));

/** The override after the titlebar's toggle, from the state it showed. */
export const toggleShown = (
  state: SidebarState,
  override: SidebarOverride
): SidebarOverride => ({ ...override, shown: state === "hidden" });

/** The override after the sidebar's width toggle, from the state it showed. */
export const toggleWidth = (
  state: SidebarState,
  override: SidebarOverride
): SidebarOverride => ({
  ...override,
  width: state === "wide" ? "narrow" : "wide",
});
