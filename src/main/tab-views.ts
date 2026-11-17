import type { KeyInput } from "#core/accelerator.ts";
import { findApp, restoreUrl } from "#core/apps.ts";
import type { App } from "#core/apps.ts";
import { contentViewBounds, viewFrame } from "#core/layout.ts";
import type { SidebarState } from "#core/sidebar.ts";
import { knownTabs, profilePartition } from "#core/state.ts";
import type { State } from "#core/state.ts";
import { showsView, transition } from "#core/tab-machine.ts";
import type { TabEffect, TabEvent, TabStatus } from "#core/tab-machine.ts";
import { findTab, tabKey } from "#core/tabs.ts";
import type { OpenedTab, PageUpdate, TabKey } from "#core/tabs.ts";
import { planViews } from "#core/views.ts";
import { allowsChildNavigation, routeWindowOpen } from "#core/window-open.ts";
import type { WindowOpenRoute } from "#core/window-open.ts";
import type { ContentView, ContentViewEvent } from "#platform/content-view.ts";
import type { Network } from "#platform/network.ts";
import type { SystemBrowser } from "#platform/system-browser.ts";
import type { AppWindow } from "#platform/window.ts";

import { createPageWriter } from "./page-writer.ts";
import type { SenderRegistry } from "./senders.ts";

export interface TabViewsDeps {
  window: Pick<
    AppWindow,
    "getContentAreaSize" | "onContentAreaResize" | "addContentView"
  >;
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
  /** Whether the unified inbox covers the content area; `reconcile` follows a change. */
  inboxOpen: () => boolean;
  /** Opens the tab, under `tabId` when it is a new one. */
  openTab: (
    profileId: string,
    app: App,
    url: string,
    tabId: string
  ) => Promise<OpenedTab | undefined>;
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
  /** Told of each mouse button pressed in a tab's page. */
  onMouseDown: () => void;
  /** Told when another tab comes to the front, the first one included. */
  onFront: () => void;
  /** Told when a tab's page finishes a load or changes its title. */
  onPageChange: (key: TabKey) => void;
  /** Told when a tab's page finishes a load, with what can read it. */
  onLoaded: (key: TabKey, page: LoadedPage) => void;
  log: (message: string) => void;
}

/** What of a tab's view a reader of its page gets. */
export type LoadedPage = Pick<ContentView, "url" | "evaluate">;

/** How long after a page's request to add an account another is dropped. */
const ADD_PROFILE_PAUSE_MS = 1000;

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

interface TabView {
  key: TabKey;
  view: ContentView;
  status: TabStatus;
  retry: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Keeps the window's content views matching the tabs: one for each tab once
 * it has been on screen, in its profile's session, beside the strip, with
 * only the front tab's showing, and hidden while it failed or crashed. Each
 * tab's status changes only through `transition`, whose effects run before
 * the status is committed.
 */
export const createTabViews = ({
  window,
  apps,
  signInOrigins,
  background,
  systemBrowser,
  network,
  senders,
  state,
  sidebar,
  inboxOpen,
  openTab,
  newId,
  addProfile,
  handleKey,
  preloadFor,
  prepareSession,
  updatePages,
  onFocus,
  onMouseDown,
  onFront,
  onPageChange,
  onLoaded,
  log,
}: TabViewsDeps) => {
  const tabs = new Map<string, TabView>();
  /** A URL a tab was opened or sent to, for its next load. */
  const pendingUrls = new Map<string, string>();
  const listeners = new Set<() => void>();
  let front: string | undefined;

  const place = (view: ContentView) => {
    view.setBounds(contentViewBounds(window.getContentAreaSize(), sidebar()));
    view.setBorderRadius(viewFrame(sidebar()).radius);
  };

  const placeAll = () => {
    for (const tab of tabs.values()) {
      place(tab.view);
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
   * The one test of whether a view shows: the front tab's, while its page
   * can, and not under the unified inbox, which leaves its status alone.
   */
  const shows = (key: string, tab: TabView) =>
    key === front && !inboxOpen() && showsView(tab.status);

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
    try {
      await view.loadURL(url);
    } catch (error) {
      log(`Tab ${key} did not load: ${describe(error)}`);
    }
  };

  const run = (
    key: string,
    tab: TabView,
    effect: TabEffect,
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

    const next = transition(tab.status, event);

    for (const effect of next.effects) {
      run(key, tab, effect, () => {
        dispatch(key, { kind: "retry-due" });
      });
    }

    if (next.status !== tab.status) {
      tab.status = next.status;
      showFront();
      notify();
    }
  };

  /**
   * Chromium's error page, shown once a load failed and until the next one
   * starts, and a crashed page are not where the tab is. A retry's page is,
   * and its title can come before it finishes loading.
   */
  const showsPage = (key: string) => {
    const status = tabs.get(key)?.status;

    return (
      status !== undefined &&
      status.kind !== "crashed" &&
      !(status.kind === "failed" && !status.retrying)
    );
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
        if (showsPage(key)) {
          pages.record({ ...tabKeyed, url: event.url });
        }

        break;
      }
      case "titled": {
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

  const openInSystemBrowser = async (url: string) => {
    try {
      await systemBrowser.open(url);
    } catch (error) {
      log(`The system browser did not open a link: ${describe(error)}`);
    }
  };

  /**
   * The URL waits for the tab's next load. Committing the tab makes it the
   * front one, whose first load takes the URL; a tab that was loaded already
   * is sent to it after.
   */
  const openAsTab = async (profileId: string, app: App, url: string) => {
    const profile = state().profiles.find(
      (candidate) => candidate.id === profileId
    );
    const existing =
      app.singleInstance && profile
        ? knownTabs(profile).find((tab) => tab.app === app.id)
        : undefined;
    const tabId = existing?.id ?? newId();
    const key = tabKey({ profileId, tabId });

    pendingUrls.set(key, url);

    try {
      const opened = await openTab(profileId, app, url, tabId);

      if (!opened) {
        pendingUrls.delete(key);
      } else if (pendingUrls.has(key)) {
        dispatch(key, { kind: "navigate" });
      }
    } catch (error) {
      pendingUrls.delete(key);
      log(`A link did not open as a tab: ${describe(error)}`);
    }
  };

  /** A page can ask for many at once and needs no click to ask. */
  let addingProfile = false;

  const addProfileFromPage = async () => {
    if (addingProfile) {
      log("Dropped a repeated request to add an account");

      return;
    }

    addingProfile = true;

    try {
      await addProfile();
    } catch (error) {
      log(`Adding a profile for a new account failed: ${describe(error)}`);
    } finally {
      setTimeout(() => {
        addingProfile = false;
      }, ADD_PROFILE_PAUSE_MS);
    }
  };

  const follow = (route: WindowOpenRoute, url: string, profileId: string) => {
    switch (route.kind) {
      case "system-browser": {
        openInSystemBrowser(route.url);
        break;
      }
      case "tab": {
        openAsTab(profileId, route.app, url);
        break;
      }
      case "add-profile": {
        addProfileFromPage();
        break;
      }
      case "deny": {
        log("Refused a window a page asked for");
        break;
      }
      default: {
        break;
      }
    }
  };

  const create = (key: string, tabKeyed: TabKey) => {
    const partition = profilePartition(tabKeyed.profileId);

    prepareSession(partition);

    const preload = preloadFor(findTab(state(), tabKeyed)?.app ?? "");
    const opening = () => ({
      signInOrigins,
      apps,
      openerApp: findTab(state(), tabKeyed)?.app ?? "",
    });
    const view = window.addContentView({
      partition,
      ...(preload !== undefined && { preload }),
      background,
      onWindowOpen: (url) => {
        const route = routeWindowOpen(url, opening());

        follow(route, url, tabKeyed.profileId);

        return route.kind === "child-window" ? "allow" : "deny";
      },
      onChildNavigation: (url) => {
        if (allowsChildNavigation(url, opening())) {
          return "allow";
        }

        const route = routeWindowOpen(url, opening());

        log("Kept a window a page opened from leaving its app");

        if (route.kind !== "child-window" && route.kind !== "deny") {
          follow(route, url, tabKeyed.profileId);
        }

        return "deny";
      },
      onWebContents: (webContentsId, role) =>
        senders.register(webContentsId, { role, ...tabKeyed }),
      onEvent: (event) => {
        onEvent(key, tabKeyed, event);
      },
      onKey: handleKey,
      onFocus,
      onMouseDown,
    });

    place(view);

    return view;
  };

  const close = (key: string, tab: TabView) => {
    tabs.delete(key);
    pendingUrls.delete(key);
    pages.forget(key);
    clearTimeout(tab.retry);

    try {
      tab.view.close();
    } catch (error) {
      log(`The view of tab ${key} did not close: ${describe(error)}`);
    }
  };

  window.onContentAreaResize(placeAll);

  network.onOnline(() => {
    for (const key of tabs.keys()) {
      dispatch(key, { kind: "online" });
    }
  });

  return {
    /** Creates, closes, shows and hides views until the window matches. */
    reconcile: (current: State) => {
      const plan = planViews(current, [...tabs.keys()]);
      const planned = new Map(plan.views.map((key) => [tabKey(key), key]));
      let changed = false;

      for (const [key, tab] of tabs) {
        if (!planned.has(key)) {
          close(key, tab);
          changed = true;
        }
      }

      for (const [key, tabKeyed] of planned) {
        if (!tabs.has(key)) {
          tabs.set(key, {
            key: tabKeyed,
            view: create(key, tabKeyed),
            status: { kind: "unloaded" },
            retry: undefined,
          });
        }
      }

      const nextFront = tabKey(plan.front);

      const frontChanged = nextFront !== front;

      if (frontChanged) {
        front = nextFront;
        dispatch(front, { kind: "select" });
      }

      showFront();

      if (frontChanged) {
        onFront();
      }

      if (changed) {
        notify();
      }
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
    /** Loads the front tab's page again; one that failed or crashed, its URL. */
    reloadFront: () => {
      if (front !== undefined) {
        dispatch(front, { kind: "reload" });
      }
    },
    /** Places every view again, as the sidebar now has it, loading nothing. */
    relayout: placeAll,
    /** What focuses the front tab's view; nothing unless it is showing. */
    focuser: () => {
      const tab = front === undefined ? undefined : tabs.get(front);

      return front !== undefined && tab && shows(front, tab)
        ? tab.view.focus
        : undefined;
    },
    /** Each tab's status; one with no view is not loaded. */
    status: (key: TabKey): TabStatus =>
      tabs.get(tabKey(key))?.status ?? { kind: "unloaded" },
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
};
