import { APP_TAB_STRIP_NARROW_WIDTH, APP_TAB_STRIP_WIDE_WIDTH } from "./constants";
import type { AccountConfig } from "./schemas";
import type { SupportedWorkspaceApp, WorkspaceAppTabStripWidth } from "./workspace-apps";

export const GMAIL_TAB_ID = "gmail";

export type TabState = {
  id: string;
  app: SupportedWorkspaceApp | undefined;
  title: string;
  pinned: boolean;
  dormant: boolean;
  windowed: boolean;
  loading: boolean;
  navigationHistory: { canGoBack: boolean; canGoForward: boolean };
  active: boolean;
};

export type AccountTabsState = {
  accountId: AccountConfig["id"];
  tabs: TabState[];
};

export function getTabStripWidth(
  tabs: Pick<TabState, "app" | "pinned">[],
  configuredTabStripWidth: WorkspaceAppTabStripWidth,
) {
  if (tabs.length <= 1) {
    return 0;
  }

  if (configuredTabStripWidth === "narrow") {
    return APP_TAB_STRIP_NARROW_WIDTH;
  }

  if (configuredTabStripWidth === "wide") {
    return APP_TAB_STRIP_WIDE_WIDTH;
  }

  const workspaceAppTabCounts = new Map<SupportedWorkspaceApp, number>();

  for (const tab of tabs) {
    if (tab.app && !tab.pinned) {
      workspaceAppTabCounts.set(tab.app, (workspaceAppTabCounts.get(tab.app) ?? 0) + 1);
    }
  }

  const hasWorkspaceAppWithMultipleTabs = Array.from(workspaceAppTabCounts.values()).some(
    (workspaceAppTabCount) => workspaceAppTabCount > 1,
  );

  return hasWorkspaceAppWithMultipleTabs ? APP_TAB_STRIP_WIDE_WIDTH : APP_TAB_STRIP_NARROW_WIDTH;
}
