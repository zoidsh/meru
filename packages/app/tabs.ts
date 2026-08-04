import { GMAIL_TAB_ID, type SupportedWorkspaceApp, type TabState } from "@meru/shared/types";
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
  isLoading: boolean;
  navigationHistory: { canGoBack: boolean; canGoForward: boolean };
  view: WebContentsView;
  updateViewBounds: () => void;
};

export class Tabs {
  tabs: Tab[];

  activeTabId: string = GMAIL_TAB_ID;

  constructor(gmail: Gmail) {
    this.tabs = [
      {
        id: GMAIL_TAB_ID,
        app: "gmail",
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
    this.tabs = this.tabs.filter((tab) => tab.id !== tabId);

    if (this.activeTabId === tabId) {
      this.activeTabId = GMAIL_TAB_ID;
    }

    this.broadcastTabsChanged();
  }

  activateTab(tabId: string) {
    this.activeTabId = tabId;

    this.broadcastTabsChanged();
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
    }
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
