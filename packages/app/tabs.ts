import { randomUUID } from "node:crypto";
import { getWorkspaceAppUrl } from "@meru/shared/google";
import type { PinnedTab } from "@meru/shared/schemas";
import {
  GMAIL_TAB_ID,
  type SupportedWorkspaceApp,
  type TabState,
  workspaceApps,
} from "@meru/shared/types";
import type { WebContentsView } from "electron";
import { accounts } from "./accounts";
import type { Gmail } from "./gmail";
import { main } from "./main";
import { WorkspaceApp } from "./workspace-app";

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

export type Tab = {
  id: string;
  app: SupportedWorkspaceApp | undefined;
  title: string;
  pinned: boolean;
  isLoading: boolean;
  navigationHistory: { canGoBack: boolean; canGoForward: boolean };
  view?: WebContentsView;
  updateViewBounds?: () => void;
};

export class DormantTab {
  id = randomUUID();

  app: SupportedWorkspaceApp;

  url: string;

  pinned = true;

  isLoading = false;

  navigationHistory = { canGoBack: false, canGoForward: false };

  loadOnLaunch: boolean;

  private pageTitle: string;

  constructor(pinnedTab: PinnedTab) {
    this.app = pinnedTab.app;
    this.url = pinnedTab.url;
    this.pageTitle = pinnedTab.title;
    this.loadOnLaunch = Boolean(pinnedTab.loadOnLaunch);
  }

  get title() {
    return this.pageTitle || workspaceApps[this.app].label;
  }
}

export class Tabs {
  private accountId: string;

  tabs: Tab[];

  activeTabId: string = GMAIL_TAB_ID;

  constructor(accountId: string, gmail: Gmail) {
    this.accountId = accountId;

    this.tabs = [
      {
        id: GMAIL_TAB_ID,
        app: "gmail",
        pinned: false,
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

  addTab(workspaceApp: WorkspaceApp) {
    this.tabs.push(workspaceApp);

    this.broadcastTabsChanged();
  }

  removeTab(tabId: string) {
    const removedTab = this.getTab(tabId);

    this.tabs = this.tabs.filter((tab) => tab.id !== tabId);

    if (this.activeTabId === tabId) {
      this.activeTabId = GMAIL_TAB_ID;
    }

    this.broadcastTabsChanged();

    if (removedTab?.pinned) {
      accounts.savePinnedTabs();
    }
  }

  activateTab(tabId: string) {
    const activatedTab = this.getTab(tabId);

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
      pinned: true,
      loadOnLaunch: dormantTab.loadOnLaunch,
      app: dormantTab.app,
    });

    this.tabs = this.tabs.filter((tab) => tab !== workspaceApp);

    this.tabs.splice(this.tabs.indexOf(dormantTab), 1, workspaceApp);

    return workspaceApp;
  }

  materializeLoadOnLaunchTabs() {
    for (const tab of this.tabs.slice()) {
      if (tab instanceof DormantTab && tab.loadOnLaunch) {
        this.materializeDormantTab(tab);
      }
    }
  }

  restorePinnedTabs(pinnedTabs: PinnedTab[]) {
    for (const pinnedTab of pinnedTabs) {
      this.tabs.push(new DormantTab(pinnedTab));
    }
  }

  activateNextTab() {
    const activeTabIndex = this.tabs.findIndex((tab) => tab.id === this.activeTabId);

    const nextTab = this.tabs.at(activeTabIndex === this.tabs.length - 1 ? 0 : activeTabIndex + 1);

    if (nextTab) {
      this.activateTab(nextTab.id);
    }
  }

  activatePreviousTab() {
    const activeTabIndex = this.tabs.findIndex((tab) => tab.id === this.activeTabId);

    const previousTab = this.tabs.at(activeTabIndex === 0 ? -1 : activeTabIndex - 1);

    if (previousTab) {
      this.activateTab(previousTab.id);
    }
  }

  closeTab(tabId: string) {
    const closableTab = this.getTab(tabId);

    if (closableTab instanceof WorkspaceApp) {
      closableTab.close();

      return;
    }

    if (closableTab instanceof DormantTab) {
      this.removeTab(tabId);
    }
  }

  pinTab(tabId: string) {
    const pinnableTab = this.getTab(tabId);

    if (!(pinnableTab instanceof WorkspaceApp)) {
      return;
    }

    pinnableTab.pinned = true;

    this.reorderTabs();

    this.broadcastTabsChanged();

    accounts.savePinnedTabs();
  }

  unpinTab(tabId: string) {
    const unpinnableTab = this.getTab(tabId);

    if (unpinnableTab instanceof DormantTab) {
      this.removeTab(tabId);

      return;
    }

    if (!(unpinnableTab instanceof WorkspaceApp)) {
      return;
    }

    unpinnableTab.pinned = false;

    this.reorderTabs();

    this.broadcastTabsChanged();

    accounts.savePinnedTabs();
  }

  private reorderTabs() {
    this.tabs = [
      ...this.tabs.filter((tab) => tab.id === GMAIL_TAB_ID),
      ...this.tabs.filter((tab) => tab.id !== GMAIL_TAB_ID && tab.pinned),
      ...this.tabs.filter((tab) => tab.id !== GMAIL_TAB_ID && !tab.pinned),
    ];
  }

  serializePinnedTabs(): PinnedTab[] {
    const pinnedTabs: PinnedTab[] = [];

    for (const tab of this.tabs) {
      if (tab instanceof WorkspaceApp && tab.pinned && tab.app) {
        pinnedTabs.push({
          app: tab.app,
          url: tab.view.webContents.getURL() || getWorkspaceAppUrl(tab.app),
          title: tab.title,
          loadOnLaunch: tab.loadOnLaunch,
        });
      } else if (tab instanceof DormantTab) {
        pinnedTabs.push({
          app: tab.app,
          url: tab.url,
          title: tab.title,
          loadOnLaunch: tab.loadOnLaunch,
        });
      }
    }

    return pinnedTabs;
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
      pinned: tab.pinned,
      dormant: tab instanceof DormantTab,
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
