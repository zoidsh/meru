import { isEqual } from "es-toolkit";

import type { KeyInput } from "#core/accelerator.ts";
import { findApp, restoreUrl } from "#core/apps.ts";
import type { App } from "#core/apps.ts";
import type { FoundInPage } from "#core/find.ts";
import { contentViewBounds, viewFrame } from "#core/layout.ts";
import { OWN_WINDOW_RADIUS } from "#core/own-window.ts";
import { FOCUS_RING, paneHandles, paneTabs } from "#core/pane-tree.ts";
import type { PaneDirection, PaneHandle, PaneTree } from "#core/pane-tree.ts";
import type { Platform } from "#core/platform.ts";
import type { SidebarState } from "#core/sidebar.ts";
import {
  inOwnWindow,
  hasNoPages,
  knownTabs,
  profilePartition,
} from "#core/state.ts";
import type { State } from "#core/state.ts";
import { showsView, transition } from "#core/tab-machine.ts";
import type { TabEffect, TabEvent, TabStatus } from "#core/tab-machine.ts";
import { findTab, newTabId, tabKey } from "#core/tabs.ts";
import type { OpenedTab, PageUpdate, TabKey } from "#core/tabs.ts";
import { placeShown, planViews } from "#core/views.ts";
import type { ViewPlan } from "#core/views.ts";
import type { Rectangle, Size } from "#core/window-bounds.ts";
import type {
  ContentView,
  ContentViewEvent,
  FindOptions,
  Navigation,
} from "#platform/content-view.ts";
import type { Network } from "#platform/network.ts";
import type { SystemBrowser } from "#platform/system-browser.ts";
import type { AppWindow } from "#platform/window.ts";
import type { ZoomChange } from "#platform/zoom.ts";

import { createLaunchTurn } from "./launch-turn.ts";
import type { OwnWindowPlace, OwnWindows } from "./own-windows.ts";
import { createPageWriter } from "./page-writer.ts";
import type { SenderRegistry } from "./senders.ts";
import { createWindowOpenRouting } from "./window-open-routing.ts";

export interface TabViewsDeps {
  window: Pick<
    AppWindow,
    | "host"
    | "getContentAreaSize"
    | "onContentAreaResize"
    | "addContentView"
    | "isDestroyed"
  >;
  /** The tabs' own windows, which their views are put in. */
  ownWindows: Pick<OwnWindows, "open" | "close" | "onResize">;
  /** The registry, or the suite's stand-ins for it. */
  apps: readonly App[];
  /** Google's sign-in, or the suite's stand-in for it. */
  signInOrigins: readonly string[];
  background: boolean;
  systemBrowser: SystemBrowser;
  network: Pick<Network, "onOnline">;
  senders: Pick<SenderRegistry, "register">;
  /** Reads main's state as it is now. */
  state: () => State;
  /** The sidebar as it is now; `relayout` follows a change. */
  sidebar: () => SidebarState;
  /** Where the narrow sidebar's width comes from. */
  platform: Platform;
  /** Opens the tab, under `tabId` when it is a new one, after the tab `after` names. */
  openTab: (
    profileId: string,
    app: App,
    url: string,
    tabId: string,
    after?: string,
    split?: PaneDirection
  ) => Promise<OpenedTab | undefined>;
  /** Makes the tab its profile's selected one. */
  selectTab: (key: TabKey) => Promise<unknown>;
  closeTab: (key: TabKey) => Promise<unknown>;
  newId: () => string;
  /** Answers Google's "Add another account". */
  addProfile: () => Promise<unknown>;
  /** Runs the shortcut a key in a page is, if it is one. */
  handleKey: (input: KeyInput) => boolean;
  /** The preload an app's view gets, if any. */
  preloadFor: (app: string) => string | undefined;
  /** Readies a profile's session before any page of it loads. */
  prepareSession: (partition: string) => void;
  updatePages: (updates: PageUpdate[]) => Promise<unknown>;
  /** Told when a tab's page gains keyboard focus, the front one's alone. */
  onFocus: () => void;
  /** Told when the page of a tab in its own window gains keyboard focus. */
  onOwnWindowFocus: (key: TabKey) => void;
  /** Told when a tab's page moves to its own window or back to the main one. */
  onMoved: (key: TabKey) => void;
  /**
   * Told when a shown pane's page other than the front one takes keyboard
   * focus unasked, as on Linux one does as it first loads, so focus goes
   * back where it was rather than to a pane the selection left.
   */
  onStrayFocus: () => void;
  /**
   * Told when another tab comes to the front, the first one included, and
   * when the front tab's page is put to sleep or woken.
   */
  onFront: () => void;
  /** Told when a tab's page finishes a load or changes its title. */
  onPageChange: (key: TabKey) => void;
  /** Told when a tab's page finishes a load, with what can read it. */
  onLoaded: (key: TabKey, page: LoadedPage) => void;
  /** Told when a tab's main frame goes elsewhere, within its document or to a new one. */
  onNavigated: (key: TabKey, inPage: boolean) => void;
  /** Told of each answer a tab's page gives to a search `find` asked of it. */
  onFound: (key: TabKey, result: FoundInPage) => void;
  log: (message: string) => void;
}

/** A pane on screen, placed in the page area. */
export interface ShellPane extends Rectangle {
  tabId: string;
  /** Put to sleep, so the shell draws its sleeping placeholder there. */
  asleep: boolean;
}

/** A gap between panes on screen, placed in the page area. */
export type ShellHandle = Omit<PaneHandle, "bounds"> & Rectangle;

export { LAUNCH_TURN_MS } from "./launch-turn.ts";

/** What of a tab's view a reader of its page gets. */
export type LoadedPage = Pick<ContentView, "url" | "evaluate">;

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Chromium's error page, shown once a load failed and until the next one
 * starts, and a crashed page are not where the tab is. A retry's page is,
 * and its title can come before it finishes loading.
 */
const isWhereTabIs = (status: TabStatus) =>
  status.kind !== "crashed" && !(status.kind === "failed" && !status.retrying);

interface TabView {
  key: TabKey;
  view: ContentView;
  status: TabStatus;
  retry: ReturnType<typeof setTimeout> | undefined;
  /** What the page is called now, once it has said since its document began. */
  title?: string;
}

/**
 * Keeps the window's content views matching the tabs: one for each tab once
 * it has been on screen, in its profile's session, beside the strip, with
 * only the front tab's showing, and hidden while it failed or crashed. Sleep
 * closes a tab's view until the tab is selected again or woken. Each
 * tab's status changes only through `transition`, whose effects run before
 * the status is committed.
 */
export const createTabViews = ({
  window,
  ownWindows,
  apps,
  signInOrigins,
  background,
  systemBrowser,
  network,
  senders,
  state,
  sidebar,
  platform,
  openTab,
  selectTab,
  closeTab,
  newId,
  addProfile,
  handleKey,
  preloadFor,
  prepareSession,
  updatePages,
  onFocus,
  onOwnWindowFocus,
  onMoved,
  onStrayFocus,
  onFront,
  onPageChange,
  onLoaded,
  onNavigated,
  onFound,
  log,
}: TabViewsDeps) => {
  const tabs = new Map<string, TabView>();
  /** A URL a tab was opened or sent to, for its next load. */
  const pendingUrls = new Map<string, string>();
  /** The URL a tab's view was asked to load, until its page commits one. */
  const asked = new Map<string, string>();
  const listeners = new Set<() => void>();
  const launch = createLaunchTurn({
    isLoading: (key) => tabs.get(key)?.status.kind === "loading",
    hasView: (key) => tabs.has(key),
    onTurnEnd: () => {
      reconcile(state());
    },
  });
  /**
   * The tabs put to sleep, which stay without a view while they are selected,
   * until woken. Not kept across launches.
   */
  const sleeping = new Set<string>();
  let front: string | undefined;
  /** The tabs on screen and the split that places them, as last planned. */
  let onScreen: Pick<ViewPlan, "shown" | "panes"> = { shown: [] };
  /**
   * The panes' tree as a gap's drag has it, which places them until the
   * drag ends and its result is stored.
   */
  let preview: PaneTree | undefined;
  let shownKeys = new Set<string>();
  /** The tabs whose views are in their own windows, and where. */
  const inWindows = new Map<string, OwnWindowPlace & { key: TabKey }>();
  /** Each tab's own page, by its webContents' id. */
  const pageViews = new Map<number, string>();
  /** A tab a page's link opened, and the tab of that page. */
  const openedFrom = new Map<string, TabKey>();

  const laidOut = (): Pick<ViewPlan, "shown" | "panes"> =>
    preview && onScreen.panes ? { ...onScreen, panes: preview } : onScreen;

  /** The page area, whose top left is 0, 0. */
  const pageArea = (): Rectangle => {
    const { width, height } = contentViewBounds(
      window.getContentAreaSize(),
      sidebar(),
      platform
    );

    return { x: 0, y: 0, width, height };
  };

  /**
   * A view on its own fills the page area; a pane's is inset by the focus
   * ring's width, so the shell's ring around the focused one shows.
   */
  const place = (key: string, view: ContentView) => {
    const own = inWindows.get(key);

    if (own) {
      view.setBounds(own.pageBounds());
      view.setBorderRadius(OWN_WINDOW_RADIUS);

      return;
    }

    const area = contentViewBounds(
      window.getContentAreaSize(),
      sidebar(),
      platform
    );
    const { radius } = viewFrame(sidebar());
    const profileId = onScreen.shown[0]?.profileId;
    const pane = onScreen.panes
      ? placeShown(laidOut(), area).find(
          ({ tabId }) =>
            profileId !== undefined && tabKey({ profileId, tabId }) === key
        )
      : undefined;

    if (pane) {
      const { x, y, width, height } = pane.bounds;

      view.setBounds({
        x: x + FOCUS_RING,
        y: y + FOCUS_RING,
        width: Math.max(0, width - 2 * FOCUS_RING),
        height: Math.max(0, height - 2 * FOCUS_RING),
      });
      view.setBorderRadius(radius - FOCUS_RING);
    } else {
      view.setBounds(area);
      view.setBorderRadius(radius);
    }
  };

  const placeAll = () => {
    for (const [key, tab] of tabs) {
      place(key, tab.view);
    }
  };

  const pages = createPageWriter(async (updates) => {
    try {
      await updatePages(updates);
    } catch (error) {
      log(`Where the tabs' pages are was not saved: ${describe(error)}`);
    }
  });

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  /**
   * The one test of whether a view shows: a tab on screen's or in its own
   * window, while its page can.
   */
  const shows = (key: string, tab: TabView) =>
    (shownKeys.has(key) || inWindows.has(key)) && showsView(tab.status);

  const showFront = () => {
    for (const [key, tab] of tabs) {
      tab.view.setVisible(shows(key, tab));
    }
  };

  const urlToLoad = (key: string, { profileId, tabId }: TabKey) => {
    const pending = pendingUrls.get(key);

    if (pending !== undefined) {
      pendingUrls.delete(key);

      return pending;
    }

    const tab = findTab(state(), { profileId, tabId });
    const app = tab && findApp(apps, tab.app);

    return tab && app ? restoreUrl(apps, app, tab.url) : undefined;
  };

  /** A failure arrives as `did-fail-load` too, which the machine hears. */
  const load = async (key: string, view: ContentView, url: string) => {
    asked.set(key, url);

    try {
      await view.loadURL(url);
    } catch (error) {
      log(`Tab ${key} did not load: ${describe(error)}`);
    }
  };

  /**
   * Where a tab put to sleep from `from` wakes, and the page to keep in
   * state: a load not yet committed is where it was going, a page shown is
   * where it is, and an error or crashed page leaves state's URL.
   */
  const placeOf = (key: string, tab: TabView, from: TabStatus) => {
    const going = asked.get(key);

    if (going !== undefined) {
      return { wake: going, page: going };
    }

    const app = findApp(apps, findTab(state(), tab.key)?.app ?? "");
    const page = tab.view.url();

    return app && page !== "" && isWhereTabIs(from)
      ? { wake: restoreUrl(apps, app, page), page }
      : undefined;
  };

  const run = (
    key: string,
    tab: TabView,
    effect: TabEffect,
    from: TabStatus,
    onRetryDue: () => void
  ) => {
    switch (effect.kind) {
      case "load": {
        const url = urlToLoad(key, tab.key);

        if (url !== undefined) {
          load(key, tab.view, url);
        }

        break;
      }
      case "reload": {
        tab.view.reload();
        break;
      }
      // The page writer may not have put the place in state yet, so it is
      // the next load's URL, and written at once in case the app quits.
      case "discard": {
        const kept = placeOf(key, tab, from);

        if (kept) {
          if (!pendingUrls.has(key)) {
            pendingUrls.set(key, kept.wake);
          }

          pages.record({ ...tab.key, url: kept.page });
          pages.writeNow();
        }

        asked.delete(key);
        tabs.delete(key);
        clearTimeout(tab.retry);
        // oxlint-disable-next-line no-use-before-define -- as Close closes a view
        closeView(key, tab.view);
        break;
      }
      case "schedule-retry": {
        clearTimeout(tab.retry);
        tab.retry = setTimeout(() => {
          tab.retry = undefined;
          onRetryDue();
        }, effect.delay);
        break;
      }
      default: {
        break;
      }
    }
  };

  const dispatch = (key: string, event: TabEvent) => {
    const tab = tabs.get(key);

    if (!tab) {
      return;
    }

    const from = tab.status;
    const next = transition(from, event);

    // Committed first, so no reader an effect reaches sees the status left.
    tab.status = next.status;
    launch.settle(key);

    for (const effect of next.effects) {
      run(key, tab, effect, from, () => {
        dispatch(key, { kind: "retry-due" });
      });
    }

    if (next.status !== from) {
      showFront();
      notify();
    }
  };

  const showsPage = (key: string) => {
    const status = tabs.get(key)?.status;

    return status !== undefined && isWhereTabIs(status);
  };

  const onEvent = (key: string, tabKeyed: TabKey, event: ContentViewEvent) => {
    switch (event.kind) {
      case "loaded": {
        dispatch(key, { kind: "loaded" });
        onPageChange(tabKeyed);

        const view = tabs.get(key)?.view;

        if (view) {
          onLoaded(tabKeyed, { url: view.url, evaluate: view.evaluate });
        }

        break;
      }
      case "failed-to-load": {
        log(`Tab ${key} could not load: ${event.name} (${event.code})`);
        dispatch(key, {
          kind: "failed-to-load",
          reason: { code: event.code, name: event.name },
        });
        break;
      }
      case "crashed": {
        log(`The page of tab ${key} is gone: ${event.reason}`);
        dispatch(key, { kind: "crashed", reason: event.reason });
        break;
      }
      case "navigated": {
        asked.delete(key);

        if (showsPage(key)) {
          pages.record({ ...tabKeyed, url: event.url });
        }

        const navigatedTab = tabs.get(key);

        if (navigatedTab && !event.inPage) {
          navigatedTab.title = "";
        }

        onNavigated(tabKeyed, event.inPage ?? false);

        notify();
        break;
      }
      case "load-started":
      case "load-stopped": {
        notify();
        break;
      }
      case "titled": {
        const titledTab = tabs.get(key);

        if (titledTab) {
          titledTab.title = event.title;
        }

        if (showsPage(key)) {
          pages.record({ ...tabKeyed, title: event.title });
          onPageChange(tabKeyed);
        }

        break;
      }
      default: {
        break;
      }
    }
  };

  /**
   * The URL waits for the tab's next load. Committing the tab makes it the
   * front one, whose first load takes the URL; a tab that was loaded already
   * is sent to it after.
   */
  const openAsTab = async (
    profileId: string,
    app: App,
    url: string,
    after?: string,
    split?: PaneDirection,
    from?: TabKey
  ) => {
    const profile = state().profiles.find(
      (candidate) => candidate.id === profileId
    );
    const existing =
      app.singleInstance && profile
        ? knownTabs(profile).find((tab) => tab.app === app.id)
        : undefined;
    const tabId = existing?.id ?? newTabId(app, newId);
    const key = tabKey({ profileId, tabId });

    if (from && !existing) {
      openedFrom.set(key, from);
    }

    pendingUrls.set(key, url);
    // oxlint-disable-next-line no-use-before-define -- the link wakes the tab it opens in
    wake(key);

    try {
      const opened = await openTab(profileId, app, url, tabId, after, split);

      if (!opened) {
        pendingUrls.delete(key);
      } else if (pendingUrls.has(key)) {
        dispatch(key, { kind: "navigate" });
      }
    } catch (error) {
      pendingUrls.delete(key);
      log(`A tab did not open: ${describe(error)}`);
    }
  };

  const routing = createWindowOpenRouting({
    apps,
    signInOrigins,
    systemBrowser,
    openerApp: (key) => findTab(state(), key)?.app ?? "",
    openAsTab: (from, app, url) =>
      openAsTab(from.profileId, app, url, undefined, undefined, from),
    addProfile,
    log,
  });

  const create = (key: string, tabKeyed: TabKey) => {
    const partition = profilePartition(tabKeyed.profileId);

    prepareSession(partition);

    const preload = preloadFor(findTab(state(), tabKeyed)?.app ?? "");
    const view = window.addContentView({
      partition,
      ...(preload !== undefined && { preload }),
      background,
      onWindowOpen: (url, request) =>
        routing.onWindowOpen(tabKeyed, url, request),
      onChildNavigation: (url) => routing.onChildNavigation(tabKeyed, url),
      onWebContents: (webContentsId, role) => {
        const drop = senders.register(webContentsId, { role, ...tabKeyed });

        if (role !== "content-view") {
          return drop;
        }

        pageViews.set(webContentsId, key);

        return () => {
          pageViews.delete(webContentsId);
          openedFrom.delete(key);
          drop();
        };
      },
      onEvent: (event) => {
        onEvent(key, tabKeyed, event);
      },
      onKey: handleKey,
      // A press, below, selects the pane; focus alone does not.
      onFocus: () => {
        if (inWindows.has(key)) {
          onOwnWindowFocus(tabKeyed);
        } else if (key !== front && shownKeys.has(key) && front !== undefined) {
          onStrayFocus();
        } else {
          onFocus();
        }
      },
      onPointerDown: () => {
        if (key !== front && shownKeys.has(key)) {
          void selectTab(tabKeyed);
        }
      },
      onFound: (result) => {
        onFound(tabKeyed, result);
      },
    });

    place(key, view);

    return view;
  };

  const closeView = (key: string, view: ContentView) => {
    try {
      view.close();
    } catch (error) {
      log(`The view of tab ${key} did not close: ${describe(error)}`);
    }
  };

  /** Drops what a closed tab, with a view or without, left waiting. */
  const forget = (key: string) => {
    pendingUrls.delete(key);
    asked.delete(key);
    pages.forget(key);
  };

  const close = (key: string, tab: TabView) => {
    tabs.delete(key);
    launch.settle(key);
    forget(key);
    clearTimeout(tab.retry);
    closeView(key, tab.view);
  };

  const frontTab = () => (front === undefined ? undefined : tabs.get(front));

  /** The tab `key` names, or the front tab without one. */
  const target = (key: TabKey | undefined) =>
    key === undefined ? frontTab() : tabs.get(tabKey(key));

  /** Places every view again; the shell hears of the panes' new places. */
  const relayout = () => {
    if (window.isDestroyed()) {
      return;
    }

    placeAll();

    if (onScreen.panes) {
      notify();
    }
  };

  window.onContentAreaResize(relayout);
  ownWindows.onResize((key) => {
    const tab = tabs.get(tabKey(key));

    if (tab && inWindows.has(tabKey(key))) {
      place(tabKey(key), tab.view);
    }
  });

  network.onOnline(() => {
    for (const key of tabs.keys()) {
      dispatch(key, { kind: "online" });
    }
  });

  /**
   * The views the window should have, after a closed tab leaves `sleeping`
   * and a sleeping tab selected anew wakes.
   */
  const plan = (current: State) => {
    const known = new Set(
      current.profiles.flatMap((profile) =>
        knownTabs(profile).map((tab) =>
          tabKey({ profileId: profile.id, tabId: tab.id })
        )
      )
    );

    for (const key of sleeping) {
      if (!known.has(key)) {
        sleeping.delete(key);
        forget(key);
      }
    }

    // A tab in its own window never sleeps, so one moved out wakes.
    for (const profile of current.profiles) {
      for (const tab of knownTabs(profile).filter(inOwnWindow)) {
        sleeping.delete(tabKey({ profileId: profile.id, tabId: tab.id }));
      }
    }

    const waiting = launch.waiting();
    const planned = planViews(
      current,
      [...tabs.keys()],
      launch.launched,
      sleeping,
      waiting
    );
    const selected = planned.front && tabKey(planned.front);

    return selected !== front &&
      selected !== undefined &&
      sleeping.delete(selected)
      ? planViews(current, [...tabs.keys()], launch.launched, sleeping, waiting)
      : planned;
  };

  /**
   * Takes away a view the window should no longer have: a sleeping
   * profile's tab sleeps, keeping its place, as Sleep would put it, and any
   * other is closed. A sleeping profile's Open at Launch tabs open again, in
   * their turn, once it wakes.
   */
  const drop = (current: State, key: string, tab: TabView) => {
    const profile = current.profiles.find(
      (candidate) => candidate.id === tab.key.profileId
    );

    if (profile && hasNoPages(current, profile) && findTab(current, tab.key)) {
      dispatch(key, { kind: "sleep" });
    }

    // A view that had not started a load has no page to keep.
    if (tabs.get(key) === tab) {
      close(key, tab);
    }
  };

  /** Takes what the plan shows; says whether that moves any view. */
  const putOnScreen = (next: ViewPlan) => {
    // Only panes place a view anywhere but the whole page area.
    const moved =
      !isEqual(next.panes, onScreen.panes) ||
      (next.panes !== undefined && !isEqual(next.shown, onScreen.shown));

    onScreen = { shown: next.shown, ...(next.panes && { panes: next.panes }) };
    shownKeys = new Set(next.shown.map(tabKey));

    if (
      preview &&
      !isEqual(next.panes && paneTabs(next.panes), paneTabs(preview))
    ) {
      preview = undefined;
    }

    return moved;
  };

  /** The other panes' pages load as they come on screen with the split. */
  const openPanes = (created: ReadonlySet<string>) => {
    for (const key of shownKeys) {
      if (key !== front && created.has(key)) {
        dispatch(key, { kind: "open" });
      }
    }
  };

  /**
   * Puts each view the plan gives a window of its own in that window, a new
   * one loading there, and each that left one back in the main window,
   * closing the window; says whether any moved. A view moves with its page
   * as it is.
   */
  const placeWindows = (next: ViewPlan, created: ReadonlySet<string>) => {
    const planned = new Map(next.windows.map((key) => [tabKey(key), key]));
    let moved = false;

    for (const [key, own] of inWindows) {
      if (planned.has(key)) {
        continue;
      }

      inWindows.delete(key);

      const tab = tabs.get(key);

      if (tab) {
        tab.view.moveTo(window.host);
        place(key, tab.view);
        onMoved(own.key);
      }

      ownWindows.close(own.key);
      moved = true;
    }

    for (const [key, keyed] of planned) {
      const tab = tabs.get(key);

      if (!tab || inWindows.has(key)) {
        continue;
      }

      const own = ownWindows.open(keyed);

      inWindows.set(key, { ...own, key: keyed });
      tab.view.moveTo(own.host);
      place(key, tab.view);
      onMoved(keyed);
      moved = true;

      if (created.has(key)) {
        dispatch(key, { kind: "open" });
      }
    }

    return moved;
  };

  const openLaunchTabs = (next: ViewPlan) => {
    launch.begin(next);

    for (const key of next.opening) {
      dispatch(tabKey(key), { kind: "open" });
    }
  };

  /** Creates, closes, shows and hides views until the window matches. */
  const apply = (current: State) => {
    for (const profile of current.profiles) {
      if (hasNoPages(current, profile)) {
        launch.again(profile.id);
      }
    }

    const next = plan(current);
    const selected = next.front && tabKey(next.front);
    const planned = new Map(next.views.map((key) => [tabKey(key), key]));
    const created = new Set<string>();
    let changed = false;

    for (const [key, tab] of tabs) {
      if (!planned.has(key)) {
        drop(current, key, tab);
        changed = true;
      }
    }

    const placesChanged = putOnScreen(next);

    for (const [key, tabKeyed] of planned) {
      if (!tabs.has(key)) {
        created.add(key);
        tabs.set(key, {
          key: tabKeyed,
          view: create(key, tabKeyed),
          status: { kind: "unloaded" },
          retry: undefined,
        });
      }
    }

    openLaunchTabs(next);

    // Another front, or the front tab woken with a new view to load.
    const frontMoved =
      selected !== front || (front !== undefined && created.has(front));

    front = selected;

    if (frontMoved && front !== undefined) {
      dispatch(front, { kind: "select" });
    }

    openPanes(created);

    const windowsChanged = placeWindows(next, created);

    if (placesChanged) {
      placeAll();
    }

    showFront();

    if (frontMoved) {
      onFront();
    }

    // The find bar follows the front, the overlay's view the panes, and the
    // shell's titlebars the windows.
    if (changed || frontMoved || placesChanged || windowsChanged) {
      notify();
    }
  };

  const reconcile = (current: State) => {
    // Meru is quitting once the main window is gone; its views go with it.
    if (!window.isDestroyed()) {
      apply(current);
    }
  };

  /**
   * Takes the tab out of sleep. The front tab, which selecting would not
   * change, gets its view again at once; any other gets one when selected.
   */
  const wake = (key: string) => {
    if (sleeping.delete(key) && key === front) {
      reconcile(state());
    }
  };

  /**
   * Frees the tab's page, keeping where it was for when it is selected
   * again or woken; the front tab stays the front, with no page.
   */
  const sleep = (key: TabKey) => {
    const keyed = tabKey(key);

    // A tab in its own window never sleeps.
    if (!tabs.has(keyed) || inWindows.has(keyed)) {
      return;
    }

    sleeping.add(keyed);
    dispatch(keyed, { kind: "sleep" });

    if (keyed === front) {
      onFront();
    }
  };

  /** The profile's tabs that have a page now. */
  const pagesOf = (profileId: string) =>
    [...tabs.values()]
      .filter((tab) => tab.key.profileId === profileId)
      .map((tab) => tab.key);

  /** Selects the tab, waking it if it sleeps. */
  const select = async (key: TabKey) => {
    wake(tabKey(key));
    await selectTab(key);
  };

  return {
    reconcile,
    /**
     * Closes a tab a link opened whose page started a download before it
     * committed, so it has nothing to show, and selects the tab of the page
     * that opened it again if it was still the one selected.
     */
    closeIfOnlyDownloading: (webContentsId: number) => {
      const key = pageViews.get(webContentsId);
      const from = key === undefined ? undefined : openedFrom.get(key);
      const tab = key === undefined ? undefined : tabs.get(key);

      if (!from || !tab || tab.view.url() !== "") {
        return;
      }

      const current = state();
      const wasSelected =
        current.selectedProfileId === tab.key.profileId &&
        current.profiles.find((profile) => profile.id === tab.key.profileId)
          ?.selectedTabId === tab.key.tabId;

      log("Closed a tab opened only to start a download");
      void (async () => {
        try {
          await closeTab(tab.key);

          if (wasSelected && findTab(state(), from)) {
            await selectTab(from);
          }
        } catch (error) {
          log(
            `A tab opened only to download did not close: ${describe(error)}`
          );
        }
      })();
    },
    /**
     * Opens `url` as a tab of `app` in the profile, selected there, or sends
     * a single-instance app's one tab to it, loading it in the view now or
     * as the view is first made.
     */
    open: openAsTab,
    /** What the machine has to hear from the tab's controls. */
    retry: (key: TabKey) => {
      dispatch(tabKey(key), { kind: "retry" });
    },
    /**
     * Loads the tab's page again; one that failed or crashed, its URL. One
     * asleep, with no page, is woken and selected.
     */
    reload: async (key: TabKey) => {
      const keyed = tabKey(key);

      if (tabs.has(keyed)) {
        dispatch(keyed, { kind: "reload" });
      } else {
        await select(key);
      }
    },
    /** Loads the front tab's page again, as `reload` does. */
    reloadFront: () => {
      if (front === undefined) {
        return;
      }

      if (tabs.has(front)) {
        dispatch(front, { kind: "reload" });
      } else {
        wake(front);
      }
    },
    select,
    /** Whether the front tab was put to sleep, and so has no page. */
    frontAsleep: () => front !== undefined && !tabs.has(front),
    sleep,
    /**
     * Puts each of the profile's pages but Gmail's to sleep, so none writes
     * its site data back while that data is deleted. A tab in its own window
     * keeps its page, since it never sleeps.
     */
    sleepAllButGmail: (profileId: string) => {
      const current = state();

      for (const key of pagesOf(profileId)) {
        if (findTab(current, key)?.app !== "gmail") {
          sleep(key);
        }
      }
    },
    /**
     * Loads each of the profile's pages again, so none runs on data that was
     * deleted, and gives each tab shown in the main window its page again,
     * the front tab and the panes beside it, if it was put to sleep.
     */
    reloadProfile: (profileId: string) => {
      for (const key of pagesOf(profileId)) {
        dispatch(tabKey(key), { kind: "reload" });
      }

      // What the main window shows is the selected profile's.
      if (state().selectedProfileId !== profileId) {
        return;
      }

      let woken = false;

      for (const key of shownKeys) {
        woken = sleeping.delete(key) || woken;
      }

      if (woken) {
        reconcile(state());
      }
    },
    /**
     * Where the page of the tab `key` names, or of the front tab, can go and
     * whether it loads, or `null` with no such page.
     */
    navigation: (key?: TabKey): Navigation | null =>
      target(key)?.view.navigation() ?? null,
    /** Each on the page of the tab `key` names, or of the front tab. */
    goBack: (key?: TabKey) => {
      target(key)?.view.goBack();
    },
    goForward: (key?: TabKey) => {
      target(key)?.view.goForward();
    },
    stopFront: (key?: TabKey) => {
      target(key)?.view.stop();
    },
    /** Zooms the front tab's page, the focused pane's in a split, or `key`'s. */
    zoomFront: (change: ZoomChange, key?: TabKey) => {
      target(key)?.view.zoom(change);
    },
    /** The tabs whose views are in their own windows. */
    windowTabs: (): TabKey[] => [...inWindows.values()].map(({ key }) => key),
    /** Whether the tab's page is in its own window and shows there. */
    showsInWindow: (key: TabKey) => {
      const keyed = tabKey(key);
      const tab = tabs.get(keyed);

      return inWindows.has(keyed) && tab !== undefined && shows(keyed, tab);
    },
    /** What focuses the page in the tab's own window, while it shows. */
    ownWindowFocuser: (key: TabKey) => {
      const keyed = tabKey(key);
      const tab = tabs.get(keyed);

      return inWindows.has(keyed) && tab && shows(keyed, tab)
        ? tab.view.focus
        : undefined;
    },
    /** Places every view again, as the sidebar now has it, loading nothing. */
    relayout,
    /** What focuses the front tab's view; nothing unless it is showing. */
    focuser: () => {
      const tab = front === undefined ? undefined : tabs.get(front);

      return front !== undefined && tab && shows(front, tab)
        ? tab.view.focus
        : undefined;
    },
    /**
     * The front tab, while its page shows; a tab asleep, failed or not yet
     * loaded has no page to search.
     */
    findable: (): TabKey | undefined => {
      const tab = frontTab();

      return front !== undefined && tab && shows(front, tab)
        ? tab.key
        : undefined;
    },
    /** Whether the tab has a page, shown or hidden; one closed or asleep has none. */
    hasPage: (key: TabKey) => tabs.has(tabKey(key)),
    /** Searches the tab's page, if it has a view; answers the search's id. */
    findInPage: (key: TabKey, term: string, options: FindOptions) =>
      tabs.get(tabKey(key))?.view.findInPage(term, options),
    stopFindInPage: (key: TabKey, keepSelection: boolean) => {
      tabs.get(tabKey(key))?.view.stopFindInPage(keepSelection);
    },
    /** Whether any tab of the profile has a view, shown or hidden. */
    hasView: (profileId: string) =>
      [...tabs.values()].some((tab) => tab.key.profileId === profileId),
    /**
     * The panes on screen while a split shows, each where it sits in the
     * page area and whether its tab was put to sleep; `null` otherwise.
     */
    panes: (): ShellPane[] | null => {
      const profileId = onScreen.shown[0]?.profileId;

      if (!onScreen.panes || profileId === undefined) {
        return null;
      }

      return placeShown(laidOut(), pageArea()).map(({ tabId, bounds }) => ({
        tabId,
        ...bounds,
        asleep: sleeping.has(tabKey({ profileId, tabId })),
      }));
    },
    /** The gaps between the panes on screen, each a handle; none without. */
    handles: (): ShellHandle[] => {
      const { panes } = laidOut();

      return panes
        ? paneHandles(panes, pageArea()).map(({ bounds, ...handle }) => ({
            ...handle,
            ...bounds,
          }))
        : [];
    },
    /** The page area's size, which the panes share. */
    areaSize: (): Size => {
      const { width, height } = pageArea();

      return { width, height };
    },
    /**
     * Places the panes as `tree`, the panes on screen with other sizes, while
     * a gap is dragged; `undefined` places them as stored again. Nothing
     * for a tree of other panes.
     */
    preview: (tree: PaneTree | undefined) => {
      const next =
        tree &&
        onScreen.panes &&
        isEqual(paneTabs(tree), paneTabs(onScreen.panes))
          ? tree
          : undefined;

      if (isEqual(next, preview)) {
        return;
      }

      preview = next;
      placeAll();
      notify();
    },
    /**
     * Where the tab's page is and, once it has said, what it is called, now
     * rather than as last saved; nothing for a tab with no view.
     */
    page: (key: TabKey) => {
      const tab = tabs.get(tabKey(key));

      return tab && { url: tab.view.url(), title: tab.title };
    },
    /** Each tab's status; one with no view, asleep or never loaded, is unloaded. */
    status: (key: TabKey): TabStatus =>
      tabs.get(tabKey(key))?.status ?? { kind: "unloaded" },
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
};
