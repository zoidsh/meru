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
  hibernatesWhenIdle: boolean | null;
  lastActiveAt: number;
};

/**
 * Whether the sweep takes this tab, before anything about how long it has been
 * idle. The per-tab mark is the user's own answer and wins either way, so it
 * both pulls a pinned tab into the unpinned sweep and holds a tab out of the
 * sweep over every tab. Only a tab that carries no mark follows the setting.
 */
export function hibernatesTabWhenIdle(
  tab: Pick<HibernatableTab, "pinned" | "hibernatesWhenIdle">,
  hibernation: WorkspaceAppsHibernation,
) {
  if (tab.hibernatesWhenIdle !== null) {
    return tab.hibernatesWhenIdle;
  }

  switch (hibernation) {
    case "all":
      return true;
    case "unpinned":
      return !tab.pinned;
    case "selected":
      return false;
  }
}

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

  if (!hibernatesTabWhenIdle(tab, hibernation)) {
    return false;
  }

  // A tab that never arrived anywhere has no URL to come back to, so unloading
  // it would strand an entry that cannot be opened.
  if (!tab.url) {
    return false;
  }

  return now - tab.lastActiveAt >= idleTimeout;
}
