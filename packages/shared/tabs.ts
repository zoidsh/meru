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

/**
 * A bookmarked entry as the titlebar's bookmarks popup lists it. Unlike the
 * strip's `bookmarks` section, which only holds the dormant ones because an
 * open bookmark moves into `normal`, this lists every bookmarked entry — the
 * popup is a list of bookmarks, not of what is currently closed.
 */
export type BookmarkState = {
  accountId: AccountConfig["id"];
  tabId: string;
  app: SupportedWorkspaceApp | undefined;
  title: string;
  windowed: boolean;
};

export function getBookmarkedTabs<BookmarkedTab extends Pick<TabState, "persistence">>(
  tabs: BookmarkedTab[],
) {
  return tabs.filter((tab) => tab.persistence === "bookmarked");
}

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
 * `windows` mode leaves the strip with only what lives in the main window:
 * windowed apps have a window of their own, and dormant entries would open as
 * one. In `tabs` mode windowed apps are listed alongside the tabs unless the
 * user turns that off. Everything filtered out here stays saved either way.
 */
export function getVisibleVerticalTabs<VerticalTab extends Pick<TabState, "dormant" | "windowed">>(
  tabs: VerticalTab[],
  {
    workspaceAppsMode,
    showWindows,
  }: { workspaceAppsMode: WorkspaceAppsMode; showWindows: boolean },
) {
  if (workspaceAppsMode === "windows") {
    return tabs.filter((tab) => !tab.dormant && !tab.windowed);
  }

  return showWindows ? tabs : tabs.filter((tab) => !tab.windowed);
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
