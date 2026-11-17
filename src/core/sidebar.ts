import { isEqual } from "es-toolkit";

import { knownTabs, selectedProfile } from "./state.ts";
import type { State, Tab } from "./state.ts";

export const SIDEBAR_STATES = ["hidden", "narrow", "wide"] as const;

export type SidebarState = (typeof SIDEBAR_STATES)[number];

const WIDTHS: Record<SidebarState, number> = {
  hidden: 0,
  narrow: 64,
  wide: 224,
};

export const sidebarWidth = (state: SidebarState) => WIDTHS[state];

/**
 * What the person chose by hand: shown or hidden by the titlebar's toggle,
 * narrow or wide by the sidebar's own. Held until the tabs change.
 */
export interface SidebarOverride {
  shown?: boolean;
  width?: "narrow" | "wide";
}

/**
 * Hidden for one tab or none, wide while some app has two or more tabs,
 * narrow otherwise.
 */
export const sidebarRule = (
  tabs: readonly Pick<Tab, "app">[]
): SidebarState => {
  if (tabs.length <= 1) {
    return "hidden";
  }

  const apps = new Set(tabs.map((tab) => tab.app));

  return apps.size < tabs.length ? "wide" : "narrow";
};

/** The rule, as the person's choices override it; shown by hand, at least narrow. */
export const sidebarState = (
  tabs: readonly Pick<Tab, "app">[],
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
