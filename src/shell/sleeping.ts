import type { ShellState } from "#contract/shell.ts";

/**
 * The selected tab while it was put to sleep selected, which main says
 * apart from a tab selected while unloaded, which is about to load.
 */
export const sleepingSelectedTab = (tabs: ShellState["tabs"]) =>
  tabs.selectedAsleep
    ? tabs.tabs.find((candidate) => candidate.id === tabs.selectedTabId)
    : undefined;
