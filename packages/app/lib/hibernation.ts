import type { WorkspaceAppsHibernation } from "@meru/shared/workspace-apps";

/**
 * What the idle sweep reads off a tab to determine whether it can unload it. A
 * `WorkspaceApp` satisfies it; nothing else is needed to make the call.
 */
type HibernatableTab = {
  isWindowed: boolean;
  isAudible: boolean;
  url: string;
  pinned: boolean;
  hibernatesWhenIdle: boolean;
  lastActiveAt: number;
};

/**
 * Whether a tab has gone idle long enough to be unloaded. The caller has
 * already ruled out the active tab, which is the one exclusion that depends on
 * the account rather than on the tab.
 */
export function canHibernateTab(
  tab: HibernatableTab,
  {
    hibernation,
    idleTimeout,
    now,
  }: { hibernation: WorkspaceAppsHibernation; idleTimeout: number; now: number },
) {
  // A tab in its own window is a window the user left open, and one playing
  // audio stops mid-track if its renderer goes away.
  if (tab.isWindowed || tab.isAudible) {
    return false;
  }

  // `all` narrows nothing down, so it has no clause of its own.
  if (hibernation === "unpinned" && tab.pinned) {
    return false;
  }

  if (hibernation === "selected" && !tab.hibernatesWhenIdle) {
    return false;
  }

  // A tab that never arrived anywhere has no URL to come back to, so unloading
  // it would strand an entry that cannot be opened.
  if (!tab.url) {
    return false;
  }

  return now - tab.lastActiveAt >= idleTimeout;
}
