import { VERTICAL_TABS_NARROW_WIDTH, VERTICAL_TABS_WIDE_WIDTH } from "./constants";
import type { AccountConfig, TabPersistence } from "./schemas";
import type { SupportedWorkspaceApp, WorkspaceAppsMode } from "./workspace-apps";

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
  persistence: TabPersistence | null;
  dormant: boolean;
  windowed: boolean;
  loadOnLaunch: boolean;
  loading: boolean;
  navigationHistory: { canGoBack: boolean; canGoForward: boolean };
  active: boolean;
};

export type AccountTabsState = {
  accountId: AccountConfig["id"];
  tabs: TabState[];
};

export const tabSections = ["pinned", "normal", "bookmarks"] as const;

export type TabSection = (typeof tabSections)[number];

export function getTabSection(tab: Pick<TabState, "id" | "persistence" | "dormant">): TabSection {
  if (tab.id === GMAIL_TAB_ID || tab.persistence === "pinned") {
    return "pinned";
  }

  if (tab.persistence === "bookmarked" && tab.dormant) {
    return "bookmarks";
  }

  return "normal";
}

/**
 * The strip shows the tabs that live in the main window. An app in its own
 * window is represented by that window, not by a row here, and in `windows`
 * mode dormant entries are left out too because opening one produces a window
 * rather than a tab. Everything filtered out stays saved either way.
 */
export function getVisibleVerticalTabs<VerticalTab extends Pick<TabState, "dormant" | "windowed">>(
  tabs: VerticalTab[],
  workspaceAppsMode: WorkspaceAppsMode,
) {
  return tabs.filter((tab) => !tab.windowed && (workspaceAppsMode === "tabs" || !tab.dormant));
}

export function getVerticalTabsWidth(
  tabs: Pick<TabState, "app" | "persistence">[],
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

  if (tabs.some((tab) => tab.persistence === "bookmarked")) {
    return VERTICAL_TABS_WIDE_WIDTH;
  }

  const workspaceAppTabCounts = new Map<SupportedWorkspaceApp, number>();

  for (const tab of tabs) {
    if (tab.app && tab.persistence !== "pinned") {
      workspaceAppTabCounts.set(tab.app, (workspaceAppTabCounts.get(tab.app) ?? 0) + 1);
    }
  }

  const hasWorkspaceAppWithMultipleTabs = Array.from(workspaceAppTabCounts.values()).some(
    (workspaceAppTabCount) => workspaceAppTabCount > 1,
  );

  return hasWorkspaceAppWithMultipleTabs ? VERTICAL_TABS_WIDE_WIDTH : VERTICAL_TABS_NARROW_WIDTH;
}
