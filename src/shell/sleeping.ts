import type { ShellState } from "#contract/shell.ts";

/**
 * The selected tab when it sleeps. Selecting a tab loads it, so only one put
 * to sleep while selected stays selected with no page.
 */
export const sleepingSelectedTab = (tabs: ShellState["tabs"]) => {
  const tab = tabs.tabs.find(
    (candidate) => candidate.id === tabs.selectedTabId
  );

  return tab?.status.kind === "unloaded" ? tab : undefined;
};
