import { randomUUID } from "node:crypto";
import type { SavedTab, TabPersistence } from "@meru/shared/schemas";
import { GMAIL_TAB_ID, type TabState } from "@meru/shared/tabs";
import type { SupportedWorkspaceApp } from "@meru/shared/workspace-apps";
import type { WebContentsView } from "electron";
import { accounts } from "./accounts";
import type { Gmail } from "./gmail";
import { main } from "./main";
import { appMenu } from "./menu";
import { WorkspaceApp } from "./workspace-app";

const MAX_RECENTLY_CLOSED_TAB_URLS = 20;

export function registerTabBroadcasts(view: WebContentsView) {
  const broadcastTabsChanged = () => {
    accounts.sendTabsChangedToRenderer();
  };

  view.webContents.on("did-navigate", broadcastTabsChanged);
  view.webContents.on("did-navigate-in-page", broadcastTabsChanged);
  view.webContents.on("page-title-updated", broadcastTabsChanged);
  view.webContents.on("did-start-loading", broadcastTabsChanged);
  view.webContents.on("did-stop-loading", broadcastTabsChanged);
}

export function isWindowedTab(tab: Tab) {
  return tab instanceof WorkspaceApp && tab.isWindowed;
}

type SavedWorkspaceApp = WorkspaceApp & {
  app: SupportedWorkspaceApp;
  persistence: TabPersistence;
};

function isSavedWorkspaceApp(tab: Tab): tab is SavedWorkspaceApp {
  return tab instanceof WorkspaceApp && tab.persistence !== null && tab.app !== undefined;
}

export type Tab = {
  id: string;
  app: SupportedWorkspaceApp | undefined;
  title: string;
  persistence: TabPersistence | null;
  isLoading: boolean;
  navigationHistory: { canGoBack: boolean; canGoForward: boolean };
  view?: WebContentsView;
  updateViewBounds?: () => void;
};

export class DormantTab {
  id = randomUUID();

  app: SupportedWorkspaceApp;

  url: string;

  persistence: TabPersistence;

  isLoading = false;

  navigationHistory = { canGoBack: false, canGoForward: false };

  loadOnLaunch: boolean;

  title: string;

  zoomFactor: number | undefined;

  constructor(savedTab: SavedTab, zoomFactor?: number) {
    this.app = savedTab.app;
    this.url = savedTab.url;
    this.title = savedTab.title;
    this.persistence = savedTab.persistence;
    this.loadOnLaunch = Boolean(savedTab.loadOnLaunch);
    this.zoomFactor = zoomFactor;
  }
}

export class Tabs {
  private accountId: string;

  tabs: Tab[];

  private _activeTabId: string = GMAIL_TAB_ID;

  private recentlyClosedTabUrls: string[] = [];

  constructor(accountId: string, gmail: Gmail) {
    this.accountId = accountId;

    this.tabs = [
      {
        id: GMAIL_TAB_ID,
        app: gmail.app,
        persistence: null,
        get title() {
          return gmail.title;
        },
        get isLoading() {
          return gmail.isLoading;
        },
        get navigationHistory() {
          return gmail.navigationHistory;
        },
        get view() {
          return gmail.view;
        },
        updateViewBounds: () => {
          gmail.updateViewBounds();
        },
      },
    ];
  }

  get hasWorkspaceTabs() {
    return this.tabs.length > 1;
  }

  get activeTabId() {
    return this._activeTabId;
  }

  set activeTabId(tabId: string) {
    if (this._activeTabId === tabId) {
      return;
    }

    this._activeTabId = tabId;

    appMenu.refresh();
  }

  get activeTab() {
    const activeTab = this.getTab(this.activeTabId);

    if (!activeTab) {
      throw new Error(`Could not find active tab ${this.activeTabId}`);
    }

    return activeTab;
  }

  getTab(tabId: string) {
    return this.tabs.find((tab) => tab.id === tabId);
  }

  openTab(url: string) {
    const workspaceApp = new WorkspaceApp({
      accountId: this.accountId,
      url,
    });

    this.tabs.push(workspaceApp);

    this.broadcastTabsChanged();

    return workspaceApp;
  }

  openWindowedTab(url: string) {
    const workspaceApp = new WorkspaceApp({
      accountId: this.accountId,
      url,
      asWindow: true,
    });

    registerTabBroadcasts(workspaceApp.view);

    this.tabs.push(workspaceApp);

    this.broadcastTabsChanged();

    return workspaceApp;
  }

  adoptTab(workspaceApp: WorkspaceApp) {
    this.tabs.push(workspaceApp);

    this.activateTab(workspaceApp.id);
  }

  removeTab(tabId: string) {
    const removedTab = this.getTab(tabId);

    this.tabs = this.tabs.filter((tab) => tab.id !== tabId);

    if (this.activeTabId === tabId) {
      this.activeTabId = GMAIL_TAB_ID;
    }

    this.broadcastTabsChanged();

    if (removedTab?.persistence) {
      accounts.saveTabs();
    }
  }

  activateTab(tabId: string) {
    const activatedTab = this.getTab(tabId);

    if (activatedTab instanceof WorkspaceApp && activatedTab.isWindowed) {
      activatedTab.focusWindow();

      return;
    }

    if (activatedTab instanceof DormantTab) {
      this.activeTabId = this.materializeDormantTab(activatedTab).id;

      this.broadcastTabsChanged();

      return;
    }

    this.activeTabId = tabId;

    this.broadcastTabsChanged();
  }

  private materializeDormantTab(dormantTab: DormantTab) {
    const workspaceApp = new WorkspaceApp({
      accountId: this.accountId,
      url: dormantTab.url,
      persistence: dormantTab.persistence,
      loadOnLaunch: dormantTab.loadOnLaunch,
      app: dormantTab.app,
      zoomFactor: dormantTab.zoomFactor,
    });

    this.tabs.splice(this.tabs.indexOf(dormantTab), 1, workspaceApp);

    return workspaceApp;
  }

  loadLaunchTabs() {
    for (const tab of this.tabs.slice()) {
      if (tab instanceof DormantTab && tab.loadOnLaunch) {
        this.materializeDormantTab(tab);
      }
    }

    this.broadcastTabsChanged();
  }

  restoreSavedTabs(savedTabs: SavedTab[]) {
    for (const savedTab of savedTabs) {
      this.tabs.push(new DormantTab(savedTab));
    }
  }

  activateNextTab() {
    this.activateAdjacentTab("next");
  }

  activatePreviousTab() {
    this.activateAdjacentTab("previous");
  }

  private activateAdjacentTab(direction: "next" | "previous") {
    const cyclableTabs = this.tabs.filter((tab) => !isWindowedTab(tab));

    const activeTabIndex = cyclableTabs.findIndex((tab) => tab.id === this.activeTabId);

    const indexOffset = direction === "next" ? 1 : -1;

    const adjacentTab = cyclableTabs.at((activeTabIndex + indexOffset) % cyclableTabs.length);

    if (adjacentTab) {
      this.activateTab(adjacentTab.id);
    }
  }

  deactivateTab(tabId: string) {
    if (this.activeTabId === tabId) {
      this.activeTabId = GMAIL_TAB_ID;
    }

    this.broadcastTabsChanged();
  }

  closeTab(tabId: string) {
    const closableTab = this.getTab(tabId);

    if (!(closableTab instanceof WorkspaceApp)) {
      return;
    }

    if (isSavedWorkspaceApp(closableTab)) {
      this.dormantizeSavedTab(closableTab);
    } else {
      this.recordRecentlyClosedTab(closableTab.url);
    }

    closableTab.close();
  }

  handleWindowedTabClosed(windowedTab: WorkspaceApp) {
    if (!this.tabs.includes(windowedTab)) {
      return;
    }

    if (isSavedWorkspaceApp(windowedTab)) {
      this.dormantizeSavedTab(windowedTab);

      return;
    }

    this.recordRecentlyClosedTab(windowedTab.url);

    this.removeTab(windowedTab.id);
  }

  private dormantizeSavedTab(savedWorkspaceApp: SavedWorkspaceApp) {
    this.tabs.splice(
      this.tabs.indexOf(savedWorkspaceApp),
      1,
      new DormantTab(
        {
          app: savedWorkspaceApp.app,
          url: savedWorkspaceApp.url,
          title: savedWorkspaceApp.title,
          persistence: savedWorkspaceApp.persistence,
          loadOnLaunch: savedWorkspaceApp.loadOnLaunch,
        },
        savedWorkspaceApp.zoomFactor,
      ),
    );

    if (this.activeTabId === savedWorkspaceApp.id) {
      this.activeTabId = GMAIL_TAB_ID;
    }

    this.broadcastTabsChanged();

    accounts.saveTabs();
  }

  private recordRecentlyClosedTab(closedTabUrl: string) {
    if (!closedTabUrl) {
      return;
    }

    this.recentlyClosedTabUrls.push(closedTabUrl);

    if (this.recentlyClosedTabUrls.length > MAX_RECENTLY_CLOSED_TAB_URLS) {
      this.recentlyClosedTabUrls.shift();
    }
  }

  reopenClosedTab() {
    const reopenedTabUrl = this.recentlyClosedTabUrls.pop();

    if (!reopenedTabUrl) {
      return;
    }

    const workspaceApp = this.openTab(reopenedTabUrl);

    this.activateTab(workspaceApp.id);

    return workspaceApp;
  }

  get hasRecentlyClosedTabs() {
    return this.recentlyClosedTabUrls.length > 0;
  }

  closeOtherTabs(keptTabId: string) {
    const previousActiveTabId = this.activeTabId;

    for (const tab of this.tabs.slice()) {
      if (tab.id !== keptTabId && tab.id !== GMAIL_TAB_ID && tab.persistence !== "pinned") {
        this.closeTab(tab.id);
      }
    }

    if (this.activeTabId !== previousActiveTabId) {
      this.activateTab(keptTabId);
    }
  }

  closeTabsBelow(tabId: string) {
    const previousActiveTabId = this.activeTabId;

    const tabIndex = this.tabs.findIndex((tab) => tab.id === tabId);

    for (const tab of this.tabs.slice(tabIndex + 1)) {
      if (tab.persistence !== "pinned") {
        this.closeTab(tab.id);
      }
    }

    if (this.activeTabId !== previousActiveTabId) {
      this.activateTab(tabId);
    }
  }

  setTabPersistence(tabId: string, persistence: TabPersistence | null) {
    const persistableTab = this.getTab(tabId);

    if (persistableTab instanceof DormantTab) {
      if (!persistence) {
        this.removeTab(tabId);

        return;
      }

      persistableTab.persistence = persistence;
    } else if (persistableTab instanceof WorkspaceApp) {
      persistableTab.persistence = persistence;
    } else {
      return;
    }

    this.reorderTabs();

    this.broadcastTabsChanged();

    accounts.saveTabs();
  }

  moveTab(tabId: string, targetSectionIndex: number) {
    if (tabId === GMAIL_TAB_ID) {
      return;
    }

    const movedTab = this.getTab(tabId);

    if (!movedTab) {
      return;
    }

    const remainingTabs = this.tabs.filter((tab) => tab.id !== tabId);

    const isMovedTabPinned = movedTab.persistence === "pinned";

    const remainingPinnedSectionTabCount = remainingTabs.filter(
      (tab) => tab.id === GMAIL_TAB_ID || tab.persistence === "pinned",
    ).length;

    const sectionStartIndex = isMovedTabPinned ? 0 : remainingPinnedSectionTabCount;

    const sectionTabCount = isMovedTabPinned
      ? remainingPinnedSectionTabCount
      : remainingTabs.length - remainingPinnedSectionTabCount;

    const minimumSectionIndex = isMovedTabPinned ? 1 : 0;

    const clampedSectionIndex = Math.min(
      Math.max(targetSectionIndex, minimumSectionIndex),
      sectionTabCount,
    );

    remainingTabs.splice(sectionStartIndex + clampedSectionIndex, 0, movedTab);

    this.tabs = remainingTabs;

    this.reorderTabs();

    this.broadcastTabsChanged();

    if (movedTab.persistence) {
      accounts.saveTabs();
    }
  }

  private reorderTabs() {
    this.tabs = [
      ...this.tabs.filter((tab) => tab.id === GMAIL_TAB_ID),
      ...this.tabs.filter((tab) => tab.id !== GMAIL_TAB_ID && tab.persistence === "pinned"),
      ...this.tabs.filter((tab) => tab.id !== GMAIL_TAB_ID && tab.persistence !== "pinned"),
    ];
  }

  serializeSavedTabs(): SavedTab[] {
    const savedTabs: SavedTab[] = [];

    for (const tab of this.tabs) {
      if (tab instanceof WorkspaceApp && tab.persistence && tab.app) {
        savedTabs.push({
          app: tab.app,
          url: tab.url,
          title: tab.title,
          persistence: tab.persistence,
          loadOnLaunch: tab.loadOnLaunch,
        });
      } else if (tab instanceof DormantTab) {
        savedTabs.push({
          app: tab.app,
          url: tab.url,
          title: tab.title,
          persistence: tab.persistence,
          loadOnLaunch: tab.loadOnLaunch,
        });
      }
    }

    return savedTabs;
  }

  closeAll() {
    for (const tab of this.tabs.slice()) {
      if (tab instanceof WorkspaceApp) {
        tab.close();
      }
    }
  }

  serialize(): TabState[] {
    return this.tabs.map((tab) => ({
      id: tab.id,
      app: tab.app,
      title: tab.title,
      persistence: tab.persistence,
      dormant: tab instanceof DormantTab,
      windowed: isWindowedTab(tab),
      loading: tab.isLoading,
      navigationHistory: tab.navigationHistory,
      active: tab.id === this.activeTabId,
    }));
  }

  private broadcastTabsChanged() {
    if (main.window.isDestroyed()) {
      return;
    }

    accounts.updateAllViewBounds();

    accounts.sendTabsChangedToRenderer();
  }
}
