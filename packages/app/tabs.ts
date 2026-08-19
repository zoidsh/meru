import { randomUUID } from "node:crypto";
import { getWorkspaceAppFromUrl } from "@meru/shared/google";
import { ms } from "@meru/shared/ms";
import type { SavedTab } from "@meru/shared/schemas";
import { getTabSection, GMAIL_TAB_ID, type TabState, tabSections } from "@meru/shared/tabs";
import type { SupportedWorkspaceApp } from "@meru/shared/workspace-apps";
import type { RestoreOptions, WebContentsView } from "electron";
import { accounts } from "./accounts";
import { bookmarks } from "./bookmarks";
import { config } from "./config";
import type { Gmail } from "./gmail";
import { canHibernateTab } from "./lib/hibernation";
import { main } from "./main";
import { appMenu } from "./menu";
import { openExternalUrl } from "./url";
import {
  canOpenWorkspaceAppInApp,
  resolveWorkspaceAppOpenBehavior,
  WorkspaceApp,
} from "./workspace-app";

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

/**
 * The Gmail tab stands for the account's inbox rather than a URL, so it is the
 * one tab with nothing to save.
 */
function isBookmarkableTab(tab: Tab): tab is WorkspaceApp | DormantTab {
  return tab instanceof WorkspaceApp || tab instanceof DormantTab;
}

type SavedWorkspaceApp = WorkspaceApp & {
  app: SupportedWorkspaceApp;
  pinned: true;
};

function isSavedWorkspaceApp(tab: Tab): tab is SavedWorkspaceApp {
  return tab instanceof WorkspaceApp && tab.pinned && tab.app !== undefined;
}

export type Tab = {
  id: string;
  app: SupportedWorkspaceApp | undefined;
  title: string;
  pinned: boolean;
  dormant: boolean;
  loadOnLaunch?: boolean;
  opensLinksForApp?: SupportedWorkspaceApp | null;
  isLoading: boolean;
  navigationHistory: { canGoBack: boolean; canGoForward: boolean };
  view?: WebContentsView;
  updateViewBounds?: () => void;
};

/**
 * What the view a tab left behind was holding, carried so that waking the tab
 * lands where it was rather than at the top of a freshly loaded page. Only a
 * tab hibernated in this session has any of it — a tab restored from disk at
 * launch starts from its URL alone.
 */
type UnloadedViewState = {
  zoomFactor?: number;
  restorableNavigationHistory?: RestoreOptions;
};

type DormantTabOptions = Omit<SavedTab, "app"> & {
  app: SupportedWorkspaceApp | undefined;
  pinned: boolean;
};

/**
 * A tab with no view behind it. It is either a pinned tab restored from disk
 * that has not been opened yet, or a tab that was unloaded after sitting idle.
 * Either way it holds its place in the strip until something materializes it.
 */
export class DormantTab {
  id = randomUUID();

  app: SupportedWorkspaceApp | undefined;

  url: string;

  pinned: boolean;

  dormant = true;

  isLoading = false;

  navigationHistory = { canGoBack: false, canGoForward: false };

  loadOnLaunch: boolean;

  hibernatesWhenIdle: boolean;

  opensLinksForApp: SupportedWorkspaceApp | null;

  windowed: boolean;

  title: string;

  zoomFactor: number | undefined;

  restorableNavigationHistory: RestoreOptions | undefined;

  constructor(dormantTab: DormantTabOptions, unloadedViewState?: UnloadedViewState) {
    this.app = dormantTab.app;
    this.url = dormantTab.url;
    this.title = dormantTab.title;
    this.pinned = dormantTab.pinned;
    this.loadOnLaunch = dormantTab.loadOnLaunch;
    this.hibernatesWhenIdle = dormantTab.hibernatesWhenIdle;
    this.opensLinksForApp = dormantTab.opensLinksForApp ?? null;
    this.windowed = dormantTab.windowed;
    this.zoomFactor = unloadedViewState?.zoomFactor;
    this.restorableNavigationHistory = unloadedViewState?.restorableNavigationHistory;
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
        pinned: false,
        dormant: false,
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

    if (removedTab?.pinned) {
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
      this.openDormantTab(activatedTab);

      return;
    }

    if (activatedTab instanceof WorkspaceApp) {
      activatedTab.lastActiveAt = Date.now();
    }

    this.activeTabId = tabId;

    this.broadcastTabsChanged();
  }

  /**
   * Wakes a saved tab up and brings it forward — that is how a link lands in a
   * designated tab that has not been opened yet.
   */
  private openDormantTab(dormantTab: DormantTab, url?: string) {
    // A designated tab is woken on the link's app, which is not necessarily the
    // one it was saved on.
    if (!canOpenWorkspaceAppInApp(url ? getWorkspaceAppFromUrl(url) : dormantTab.app)) {
      void openExternalUrl(url ?? dormantTab.url, { skipTrustedHostCheck: true });

      return;
    }

    const materializedTab = this.materializeDormantTab(dormantTab, url);

    if (!materializedTab.isWindowed) {
      this.activeTabId = materializedTab.id;
    }

    this.broadcastTabsChanged();

    return materializedTab;
  }

  private materializeDormantTab(dormantTab: DormantTab, url?: string) {
    const workspaceApp = new WorkspaceApp({
      accountId: this.accountId,
      url: url ?? dormantTab.url,
      pinned: dormantTab.pinned,
      loadOnLaunch: dormantTab.loadOnLaunch,
      hibernatesWhenIdle: dormantTab.hibernatesWhenIdle,
      opensLinksForApp: dormantTab.opensLinksForApp,
      asWindow: dormantTab.windowed || config.get("workspaceApps.mode") === "windows",
      savedAsWindow: dormantTab.windowed,
      app: dormantTab.app,
      zoomFactor: dormantTab.zoomFactor,
      // A URL passed in wins: the tab is being woken to take that link, which
      // the history it hibernated with doesn't contain.
      navigationHistory: url ? undefined : dormantTab.restorableNavigationHistory,
    });

    if (workspaceApp.isWindowed) {
      registerTabBroadcasts(workspaceApp.view);
    }

    this.tabs.splice(this.tabs.indexOf(dormantTab), 1, workspaceApp);

    this.reorderTabs();

    return workspaceApp;
  }

  loadLaunchTabs() {
    for (const tab of this.tabs.slice()) {
      if (tab instanceof DormantTab && tab.loadOnLaunch && canOpenWorkspaceAppInApp(tab.app)) {
        this.materializeDormantTab(tab);
      }
    }

    this.broadcastTabsChanged();
  }

  restoreSavedTabs(savedTabs: SavedTab[]) {
    for (const savedTab of savedTabs) {
      this.tabs.push(new DormantTab({ ...savedTab, pinned: true }));
    }
  }

  activateNextTab() {
    this.activateAdjacentTab("next");
  }

  activatePreviousTab() {
    this.activateAdjacentTab("previous");
  }

  private activateAdjacentTab(direction: "next" | "previous") {
    const isWindowsMode = config.get("workspaceApps.mode") === "windows";

    const cyclableTabs = this.tabs.filter(
      (tab) => !isWindowedTab(tab) && !(isWindowsMode && tab.dormant && tab.pinned),
    );

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

    // An unloaded tab has no view to close, so closing it is closing the entry
    // itself. A pinned one is saved, and closing it again would throw away what
    // the user pinned.
    if (closableTab instanceof DormantTab) {
      if (closableTab.pinned) {
        return;
      }

      this.recordRecentlyClosedTab(closableTab.url);

      this.removeTab(tabId);

      return;
    }

    if (!(closableTab instanceof WorkspaceApp)) {
      return;
    }

    if (isSavedWorkspaceApp(closableTab)) {
      this.dormantizeTab(closableTab);
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
      this.dormantizeTab(windowedTab);

      return;
    }

    this.recordRecentlyClosedTab(windowedTab.url);

    this.removeTab(windowedTab.id);
  }

  /**
   * Swaps a tab's view for the entry it leaves behind, keeping its place in the
   * strip. Only a pinned tab is written back to disk — an unpinned one lives
   * for as long as the app runs either way.
   */
  private dormantizeTab(workspaceApp: WorkspaceApp) {
    this.tabs.splice(
      this.tabs.indexOf(workspaceApp),
      1,
      new DormantTab(
        {
          app: workspaceApp.app,
          url: workspaceApp.url,
          title: workspaceApp.title,
          pinned: workspaceApp.pinned,
          loadOnLaunch: workspaceApp.loadOnLaunch,
          hibernatesWhenIdle: workspaceApp.hibernatesWhenIdle,
          opensLinksForApp: workspaceApp.opensLinksForApp,
          windowed: workspaceApp.opensAsWindow,
        },
        {
          zoomFactor: workspaceApp.zoomFactor,
          restorableNavigationHistory: workspaceApp.restorableNavigationHistory,
        },
      ),
    );

    if (this.activeTabId === workspaceApp.id) {
      this.activeTabId = GMAIL_TAB_ID;
    }

    this.reorderTabs();

    this.broadcastTabsChanged();

    if (workspaceApp.pinned) {
      accounts.saveTabs();
    }
  }

  /**
   * Unloads tabs the user has left alone for the configured timeout, giving
   * back the renderer process each one holds. A hibernated tab keeps its place
   * in the strip and loads again when it is opened.
   */
  hibernateIdleTabs() {
    const now = Date.now();

    const activeTab = this.activeTab;

    if (activeTab instanceof WorkspaceApp) {
      activeTab.lastActiveAt = now;
    }

    const hibernatesEveryTab = config.get("workspaceApps.hibernation") === "all";

    const idleTimeout = ms(config.get("workspaceApps.hibernationTimeout"));

    for (const tab of this.tabs.slice()) {
      if (!(tab instanceof WorkspaceApp) || tab.id === this.activeTabId) {
        continue;
      }

      if (canHibernateTab(tab, { hibernatesEveryTab, idleTimeout, now })) {
        this.hibernateTab(tab);
      }
    }
  }

  private hibernateTab(workspaceApp: WorkspaceApp) {
    this.dormantizeTab(workspaceApp);

    workspaceApp.close();
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

  /**
   * Apps that may not open inside Meru go to the default browser instead,
   * leaving nothing to return.
   */
  openUrl(url: string) {
    if (!canOpenWorkspaceAppInApp(getWorkspaceAppFromUrl(url))) {
      void openExternalUrl(url, { skipTrustedHostCheck: true });

      return;
    }

    if (resolveWorkspaceAppOpenBehavior() === "newWindow") {
      return this.openWindowedTab(url);
    }

    const workspaceApp = this.openTab(url);

    this.activateTab(workspaceApp.id);

    return workspaceApp;
  }

  reopenClosedTab() {
    const reopenedTabUrl = this.recentlyClosedTabUrls.pop();

    if (!reopenedTabUrl) {
      return;
    }

    return this.openUrl(reopenedTabUrl);
  }

  get hasRecentlyClosedTabs() {
    return this.recentlyClosedTabUrls.length > 0;
  }

  closeOtherTabs(keptTabId: string) {
    const previousActiveTabId = this.activeTabId;

    for (const tab of this.tabs.slice()) {
      if (tab.id !== keptTabId && tab.id !== GMAIL_TAB_ID && !tab.pinned) {
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
      if (!tab.pinned) {
        this.closeTab(tab.id);
      }
    }

    if (this.activeTabId !== previousActiveTabId) {
      this.activateTab(tabId);
    }
  }

  setTabPinned(tabId: string, pinned: boolean) {
    const pinnableTab = this.getTab(tabId);

    if (!(pinnableTab instanceof WorkspaceApp) && !(pinnableTab instanceof DormantTab)) {
      return;
    }

    pinnableTab.pinned = pinned;

    if (!pinned) {
      pinnableTab.loadOnLaunch = false;
    }

    this.reorderTabs();

    this.broadcastTabsChanged();

    // Pinning carries a tab in and out of the section that cannot be closed
    // without changing which tab is active, so nothing else would rebuild the
    // menu on the Close Tab entry's behalf.
    appMenu.refresh();

    accounts.saveTabs();
  }

  /**
   * The tab every link to `app` opens in, if the user designated one. Only one
   * tab per app can take that app's links. The tab holds the app it was
   * designated for rather than the one it happens to be showing, so browsing on
   * never hands the designation to another app.
   */
  getAppLinksTab(app: SupportedWorkspaceApp) {
    return this.tabs.find((tab) => tab.opensLinksForApp === app);
  }

  setTabOpensLinksForApp(tabId: string, app: SupportedWorkspaceApp | null) {
    const designatedTab = this.getTab(tabId);

    if (!(designatedTab instanceof WorkspaceApp) && !(designatedTab instanceof DormantTab)) {
      return;
    }

    if (app) {
      const previousAppLinksTab = this.getAppLinksTab(app);

      if (previousAppLinksTab) {
        previousAppLinksTab.opensLinksForApp = null;
      }
    }

    designatedTab.opensLinksForApp = app;

    this.broadcastTabsChanged();

    accounts.saveTabs();
  }

  /**
   * Opens a URL in the tab designated for its app, and returns that tab to signal
   * that the URL was taken. Apps that aren't allowed to open inside Meru are left
   * to the caller, which falls back to the default browser.
   */
  openInAppLinksTab(url: string) {
    const app = getWorkspaceAppFromUrl(url);

    if (!app || !canOpenWorkspaceAppInApp(app)) {
      return;
    }

    const appLinksTab = this.getAppLinksTab(app);

    if (!appLinksTab) {
      return;
    }

    if (appLinksTab instanceof DormantTab) {
      return this.openDormantTab(appLinksTab, url);
    }

    if (!(appLinksTab instanceof WorkspaceApp)) {
      return;
    }

    appLinksTab.navigate(url);

    this.activateTab(appLinksTab.id);

    return appLinksTab;
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

    const movedTabSection = getTabSection(movedTab);

    const sectionStartIndex = remainingTabs.filter(
      (tab) => tabSections.indexOf(getTabSection(tab)) < tabSections.indexOf(movedTabSection),
    ).length;

    const sectionTabCount = remainingTabs.filter(
      (tab) => getTabSection(tab) === movedTabSection,
    ).length;

    const minimumSectionIndex = movedTabSection === "pinned" ? 1 : 0;

    const clampedSectionIndex = Math.min(
      Math.max(targetSectionIndex, minimumSectionIndex),
      sectionTabCount,
    );

    remainingTabs.splice(sectionStartIndex + clampedSectionIndex, 0, movedTab);

    this.tabs = remainingTabs;

    this.reorderTabs();

    this.broadcastTabsChanged();

    if (movedTab.pinned) {
      accounts.saveTabs();
    }
  }

  private reorderTabs() {
    this.tabs = tabSections.flatMap((tabSection) =>
      this.tabs.filter((tab) => getTabSection(tab) === tabSection),
    );
  }

  serializeSavedTabs(): SavedTab[] {
    const savedTabs: SavedTab[] = [];

    for (const tab of this.tabs) {
      if (tab instanceof WorkspaceApp && tab.pinned && tab.app) {
        savedTabs.push({
          app: tab.app,
          url: tab.url,
          title: tab.title,
          loadOnLaunch: tab.loadOnLaunch,
          hibernatesWhenIdle: tab.hibernatesWhenIdle,
          opensLinksForApp: tab.opensLinksForApp,
          windowed: tab.opensAsWindow,
        });
      } else if (tab instanceof DormantTab && tab.pinned && tab.app) {
        savedTabs.push({
          app: tab.app,
          url: tab.url,
          title: tab.title,
          loadOnLaunch: tab.loadOnLaunch,
          hibernatesWhenIdle: tab.hibernatesWhenIdle,
          opensLinksForApp: tab.opensLinksForApp,
          windowed: tab.windowed,
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
      pinned: tab.pinned,
      dormant: tab.dormant,
      windowed: isWindowedTab(tab),
      bookmarked: isBookmarkableTab(tab) && bookmarks.isBookmarked(this.accountId, tab.url),
      opensLinksForApp: tab.opensLinksForApp ?? null,
      loadOnLaunch: Boolean(tab.loadOnLaunch),
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
