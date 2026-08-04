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

export type Tab = {
  id: string;
  app: SupportedWorkspaceApp | undefined;
  title: string;
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
        title: workspaceApps.gmail.label,
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
