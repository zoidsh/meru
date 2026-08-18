/**
 * What the idle sweep reads off a tab to decide whether it may unload it. A
 * `WorkspaceApp` satisfies it; nothing else is needed to make the call.
 */
type HibernatableTab = {
  isWindowed: boolean;
  isAudible: boolean;
  url: string;
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
    hibernatesEveryTab,
    idleTimeout,
    now,
  }: { hibernatesEveryTab: boolean; idleTimeout: number; now: number },
) {
  // A tab in its own window is a window the user left open, and one playing
  // audio stops mid-track if its renderer goes away.
  if (tab.isWindowed || tab.isAudible) {
    return false;
  }

  if (!hibernatesEveryTab && !tab.hibernatesWhenIdle) {
    return false;
  }

  // A tab that never arrived anywhere has no URL to come back to, so unloading
  // it would strand an entry that cannot be opened.
  if (!tab.url) {
    return false;
  }

  return now - tab.lastActiveAt >= idleTimeout;
}
