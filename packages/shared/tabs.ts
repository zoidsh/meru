import { APP_TAB_STRIP_NARROW_WIDTH, APP_TAB_STRIP_WIDE_WIDTH } from "./constants";
import type { AccountConfig } from "./schemas";
import type { SupportedWorkspaceApp } from "./workspace-apps";

export const GMAIL_TAB_ID = "gmail";

export type TabState = {
  id: string;
  app: SupportedWorkspaceApp | undefined;
  title: string;
  pinned: boolean;
  dormant: boolean;
  loading: boolean;
  navigationHistory: { canGoBack: boolean; canGoForward: boolean };
  active: boolean;
};

export type AccountTabsState = {
  accountId: AccountConfig["id"];
  tabs: TabState[];
};

export function getTabStripWidth(tabs: Pick<TabState, "app">[], hasBookmarkedApps: boolean) {
  if (tabs.length <= 1 && !hasBookmarkedApps) {
    return 0;
  }

  const workspaceAppTabCounts = new Map<SupportedWorkspaceApp, number>();

  for (const tab of tabs) {
    if (tab.app) {
      workspaceAppTabCounts.set(tab.app, (workspaceAppTabCounts.get(tab.app) ?? 0) + 1);
    }
  }

  const hasWorkspaceAppWithMultipleTabs = Array.from(workspaceAppTabCounts.values()).some(
    (workspaceAppTabCount) => workspaceAppTabCount > 1,
  );

  return hasWorkspaceAppWithMultipleTabs ? APP_TAB_STRIP_WIDE_WIDTH : APP_TAB_STRIP_NARROW_WIDTH;
}
