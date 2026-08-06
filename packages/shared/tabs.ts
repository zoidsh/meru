import { VERTICAL_TABS_NARROW_WIDTH, VERTICAL_TABS_WIDE_WIDTH } from "./constants";
import type { AccountConfig } from "./schemas";
import type { SupportedWorkspaceApp } from "./workspace-apps";

export const GMAIL_TAB_ID = "gmail";

export const verticalTabsWidths = {
  auto: "Auto",
  narrow: "Narrow",
  wide: "Wide",
} as const;

export type VerticalTabsWidth = keyof typeof verticalTabsWidths;

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

export function getVerticalTabsWidth(
  tabs: Pick<TabState, "app" | "pinned">[],
  configuredVerticalTabsWidth: VerticalTabsWidth,
) {
  if (tabs.length <= 1) {
    return 0;
  }

  if (configuredVerticalTabsWidth === "narrow") {
    return VERTICAL_TABS_NARROW_WIDTH;
  }

  if (configuredVerticalTabsWidth === "wide") {
    return VERTICAL_TABS_WIDE_WIDTH;
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

  return hasWorkspaceAppWithMultipleTabs ? VERTICAL_TABS_WIDE_WIDTH : VERTICAL_TABS_NARROW_WIDTH;
}
