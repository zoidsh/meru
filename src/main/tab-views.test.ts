import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { APPS } from "#core/apps.ts";
import type { FoundInPage } from "#core/find.ts";
import type { SidebarState } from "#core/sidebar.ts";
import { gmailTab, knownTabs, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import { tabKey } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import type { Size } from "#core/window-bounds.ts";
import { SIGN_IN_ORIGINS } from "#core/window-open.ts";
import type {
  ContentViewEvent,
  ContentViewOptions,
  Navigation,
} from "#platform/content-view.ts";

import { createProfiles } from "./profiles.ts";
import { createSenderRegistry } from "./senders.ts";
import { LAUNCH_TURN_MS, createTabViews } from "./tab-views.ts";
import type { LoadedPage } from "./tab-views.ts";

const GMAIL = "https://mail.google.com/mail/u/0";

const CALENDAR = "https://calendar.google.com/calendar/r/week";

const REFUSED: ContentViewEvent = {
  kind: "failed-to-load",
  code: -102,
  name: "ERR_CONNECTION_REFUSED",
};

const initial: State = {
  version: 1,
  profiles: [
    {
      ...newProfile("a", "Default"),
      tabs: [
        { ...gmailTab(), url: `${GMAIL}/#inbox/kept` },
        { id: "c1", app: "calendar", url: CALENDAR, title: "Week" },
      ],
    },
    newProfile("b", "Profile 2"),
  ],
  selectedProfileId: "a",
};

interface FakeView {
  partition: string;
  options: ContentViewOptions;
  bounds: unknown[];
  radii: number[];
  loaded: string[];
  /** The URL its page last committed, which a load does not change until then. */
  committed: string;
  reloads: number;
  visible: boolean | undefined;
  closed: boolean;
  focuses: number;
  /** What the page answers of its history and load, and what was asked of it. */
  navigation: Navigation;
  moves: string[];
  /** Each search asked of the page, and each stop. */
  finds: string[];
  /** The window it is in: the main window's 1, or a tab's own. */
  host: number;
  webContentsId: number;
}

/** The main window's host. */
const MAIN_HOST = 1;

/**
 * The real profiles over a save that only records, a fake window, and a
 * network whose return the test announces.
 */
const setup = async ({ state = initial }: { state?: State } = {}) => {
  let size: Size = { width: 1280, height: 800 };
  let sidebar: SidebarState = "wide";
  let resize: (() => void) | undefined;
  let online: (() => void) | undefined;
  const views: FakeView[] = [];
  const opened: string[] = [];
  const saves: State[] = [];
  const logs: string[] = [];
  /** Each session readied, with how many views existed then. */
  const prepared: [string, number][] = [];
  const senders = createSenderRegistry();
  let webContentsIds = 10;
  let ids = 0;
  let fronts = 0;
  let profilesAdded = 0;
  const pageChanges: TabKey[] = [];
  const loads: { key: TabKey; page: LoadedPage }[] = [];
  const focusEvents: string[] = [];
  const found: { key: TabKey; result: FoundInPage }[] = [];
  /** Each own window open, by its tab's key, and its host. */
  const ownWindows = new Map<string, number>();
  const windowEvents: string[] = [];
  let hosts = MAIN_HOST;
  let ownWindowResize: ((key: TabKey) => void) | undefined;
  let mainDestroyed = false;

  const profiles = createProfiles({
    initial: state,
    save: (next) => {
      saves.push(next);

      return Promise.resolve();
    },
    newId: () => "unused",
    profileName: (n) => `Profile ${n}`,
    clearSession: () => Promise.resolve(),
    now: () => 0,
    log: (message) => logs.push(message),
  });

  const tabs = createTabViews({
    ownWindows: {
      open: (key) => {
        const keyed = tabKey(key);

        if (!ownWindows.has(keyed)) {
          hosts += 1;
          ownWindows.set(keyed, hosts);
          windowEvents.push(`open ${keyed}`);
        }

        return {
          host: { hostId: ownWindows.get(keyed) ?? 0 },
          pageBounds: () => ({ x: 8, y: 40, width: 984, height: 652 }),
        };
      },
      close: (key) => {
        ownWindows.delete(tabKey(key));
        windowEvents.push(`close ${tabKey(key)}`);
      },
      onResize: (listener) => {
        ownWindowResize = listener;
      },
    },
    window: {
      host: { hostId: MAIN_HOST },
      isDestroyed: () => mainDestroyed,
      getContentAreaSize: () => {
        if (mainDestroyed) {
          throw new Error("Object has been destroyed");
        }

        return size;
      },
      onContentAreaResize: (listener) => {
        resize = listener;
      },
      addContentView: (options) => {
        const view: FakeView = {
          partition: options.partition,
          options,
          bounds: [],
          radii: [],
          loaded: [],
          committed: "",
          reloads: 0,
          visible: undefined,
          closed: false,
          focuses: 0,
          navigation: { canGoBack: false, canGoForward: false, loading: false },
          moves: [],
          finds: [],
          host: MAIN_HOST,
          webContentsId: 0,
        };

        webContentsIds += 1;
        view.webContentsId = webContentsIds;
        views.push(view);
        options.onWebContents(webContentsIds, "content-view");

        return {
          setBounds: (rectangle) => view.bounds.push(rectangle),
          setBorderRadius: (radius) => view.radii.push(radius),
          reload: () => {
            view.reloads += 1;
          },
          goBack: () => view.moves.push("back"),
          goForward: () => view.moves.push("forward"),
          stop: () => view.moves.push("stop"),
          navigation: () => view.navigation,
          url: () => view.committed,
          evaluate: () => Promise.resolve(view.partition),
          loadURL: (url) => {
            view.loaded.push(url);
            // As Electron's view tells of the load starting before it returns.
            options.onEvent({ kind: "load-started" });

            return Promise.resolve();
          },
          setVisible: (visible) => {
            view.visible = visible;
          },
          close: () => {
            view.closed = true;
          },
          focus: () => {
            view.focuses += 1;
          },
          findInPage: (term, { findNext, forward }) => {
            view.finds.push(`${term} ${findNext} ${forward}`);

            return view.finds.length;
          },
          stopFindInPage: (keepSelection) => {
            view.finds.push(`stop ${keepSelection}`);
          },
          zoom: (change) => view.moves.push(`zoom ${change}`),
          moveTo: ({ hostId }) => {
            view.host = hostId;
          },
        };
      },
    },
    apps: APPS,
    signInOrigins: SIGN_IN_ORIGINS,
    background: true,
    systemBrowser: {
      open: (url) => {
        opened.push(url);

        return Promise.resolve();
      },
    },
    network: {
      onOnline: (listener) => {
        online = listener;

        return () => false;
      },
    },
    senders,
    state: profiles.get,
    sidebar: () => sidebar,
    platform: "linux",
    openTab: profiles.openTab,
    selectTab: profiles.selectTab,
    closeTab: profiles.closeTab,
    newId: () => {
      ids += 1;

      return `new-${ids}`;
    },
    addProfile: () => {
      profilesAdded += 1;

      return Promise.resolve();
    },
    handleKey: () => false,
    preloadFor: (app) =>
      app === "gmail" ? "/app/preload-gmail.cjs" : undefined,
    prepareSession: (partition) => {
      prepared.push([partition, views.length]);
    },
    updatePages: profiles.updatePages,
    onFocus: () => {
      focusEvents.push("front");
    },
    onOwnWindowFocus: (key) => {
      focusEvents.push(`window ${tabKey(key)}`);
    },
    onMoved: (key) => {
      windowEvents.push(`moved ${tabKey(key)}`);
    },
    onStrayFocus: () => {
      focusEvents.push("stray");
    },
    onFront: () => {
      fronts += 1;
    },
    onPageChange: (key) => {
      pageChanges.push(key);
    },
    onLoaded: (key, page) => {
      loads.push({ key, page });
    },
    onNavigated: () => false,
    onFound: (key, result) => {
      found.push({ key, result });
    },
    log: (message) => logs.push(message),
  });

  tabs.reconcile(profiles.get());
  profiles.onChange(tabs.reconcile);

  const viewOf = (partition: string, index = 0) =>
    views.filter((view) => view.partition === partition && !view.closed)[index];

  await vi.advanceTimersByTimeAsync(0);

  return {
    profiles,
    tabs,
    views,
    opened,
    saves,
    logs,
    prepared,
    senders,
    viewOf,
    live: () =>
      views
        .filter((view) => !view.closed)
        .map((view) => [view.partition, view.loaded.at(-1), view.visible]),
    emit: (view: FakeView | undefined, event: ContentViewEvent) => {
      if (view && event.kind === "navigated") {
        view.committed = event.url;
      }

      view?.options.onEvent(event);
    },
    goOnline: () => online?.(),
    ownWindows,
    windowEvents,
    resizeOwnWindow: (key: TabKey) => ownWindowResize?.(key),
    destroyMain: () => {
      mainDestroyed = true;
    },
    fronts: () => fronts,
    profilesAdded: () => profilesAdded,
    pageChanges,
    loads,
    focusEvents,
    found,
    setSidebar: (next: SidebarState) => {
      sidebar = next;
      tabs.relayout();
    },
    resizeTo: (next: Size) => {
      size = next;
      resize?.();
    },
  };
};

describe(createTabViews, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates only the selected tab's view at first, loading Gmail at its home beside the strip", async () => {
    const window = await setup();

    expect(window.live()).toStrictEqual([["persist:a", GMAIL, true]]);
    expect(window.prepared).toStrictEqual([["persist:a", 0]]);
    expect(window.views[0]?.bounds).toStrictEqual([
      { x: 224, y: 40, width: 1048, height: 752 },
    ]);
    expect(
      window.tabs.status({ profileId: "a", tabId: "gmail" })
    ).toStrictEqual({ kind: "loading" });
    expect(window.tabs.status({ profileId: "a", tabId: "c1" })).toStrictEqual({
      kind: "unloaded",
    });
  });

  it("opens the next profile's Open at Launch tabs only once the selected profile's have loaded", async () => {
    const window = await setup();

    expect(window.viewOf("persist:b")).toBeUndefined();

    window.emit(window.viewOf("persist:a"), { kind: "loaded" });
    await vi.advanceTimersByTimeAsync(0);

    expect([
      window.live(),
      window.tabs.status({ profileId: "b", tabId: "gmail" }),
    ]).toStrictEqual([
      [
        ["persist:a", GMAIL, true],
        ["persist:b", GMAIL, false],
      ],
      { kind: "loading" },
    ]);
  });

  it("opens the next profile's Open at Launch tabs once the selected profile's turn is up, though its page is still loading", async () => {
    const window = await setup();

    await vi.advanceTimersByTimeAsync(LAUNCH_TURN_MS - 1);

    expect(window.viewOf("persist:b")).toBeUndefined();

    // The cap, then the next turn's plan, a timer of 0 that fires 1ms on.
    await vi.advanceTimersByTimeAsync(2);

    expect([
      window.tabs.status({ profileId: "a", tabId: "gmail" }),
      window.tabs.status({ profileId: "b", tabId: "gmail" }),
    ]).toStrictEqual([{ kind: "loading" }, { kind: "loading" }]);
  });

  it("answers the front tab's history and load, moves only the front view, and tells of every load", async () => {
    const window = await setup();
    const gmail = window.viewOf("persist:a");
    let changes = 0;

    window.tabs.onChange(() => {
      changes += 1;
    });

    if (gmail) {
      gmail.navigation = {
        canGoBack: true,
        canGoForward: false,
        loading: true,
      };
    }

    window.emit(gmail, { kind: "load-started" });
    window.emit(gmail, { kind: "load-stopped" });
    window.emit(gmail, {
      kind: "navigated",
      url: `${GMAIL}/#sent`,
      inPage: true,
    });

    expect(changes).toBe(3);
    expect(window.tabs.navigation()).toStrictEqual({
      canGoBack: true,
      canGoForward: false,
      loading: true,
    });

    window.tabs.goBack();
    window.tabs.goForward();
    window.tabs.stopFront();
    window.tabs.zoomFront("in");
    await window.profiles.selectTab({ profileId: "a", tabId: "c1" });
    window.tabs.goBack();
    window.tabs.zoomFront("reset");

    expect(gmail?.moves).toStrictEqual(["back", "forward", "stop", "zoom in"]);
    expect(window.viewOf("persist:a", 1)?.moves).toStrictEqual([
      "back",
      "zoom reset",
    ]);
  });

  it("searches a tab's page, tells of its answers, and offers only a front page that shows to search", async () => {
    const window = await setup();
    const gmail = window.viewOf("persist:a");
    const key = { profileId: "a", tabId: "gmail" };

    const offered = window.tabs.findable();
    const id = window.tabs.findInPage(key, "apple", {
      findNext: true,
      forward: false,
    });

    window.tabs.stopFindInPage(key, true);
    gmail?.options.onFound({ requestId: 1, ordinal: 1, matches: 3 });

    expect([offered, id, gmail?.finds, window.found]).toStrictEqual([
      key,
      1,
      ["apple true false", "stop true"],
      [{ key, result: { requestId: 1, ordinal: 1, matches: 3 } }],
    ]);

    window.tabs.sleep(key);

    expect(window.tabs.findable()).toBeUndefined();
  });

  it("gives Gmail's view Gmail's preload and another app's view none", async () => {
    const window = await setup();

    await window.profiles.selectTab({ profileId: "a", tabId: "c1" });

    expect(window.views.map((view) => view.options.preload)).toStrictEqual([
      "/app/preload-gmail.cjs",
      undefined,
    ]);
  });

  it("registers each view's webContents with its profile and tab", async () => {
    const window = await setup();

    expect(window.senders.identify(11)).toStrictEqual({
      role: "content-view",
      profileId: "a",
      tabId: "gmail",
    });
  });

  it("loads a restored tab where it was when first selected, hides the other and keeps it loaded", async () => {
    const window = await setup();

    await window.profiles.selectTab({ profileId: "a", tabId: "c1" });
    await window.profiles.selectTab({ profileId: "a", tabId: "gmail" });

    expect(window.live()).toStrictEqual([
      ["persist:a", GMAIL, true],
      ["persist:a", CALENDAR, false],
    ]);
    expect(window.views.map((view) => view.loaded.length)).toStrictEqual([
      1, 1,
    ]);
  });

  it("tells when another tab comes to the front, its listeners too, and focuses only the front tab's view while it shows", async () => {
    const window = await setup();
    const calendar = { profileId: "a", tabId: "c1" };
    let changes = 0;

    expect(window.fronts()).toBe(1);

    await window.profiles.selectTab(calendar);
    await window.profiles.select("b");
    window.tabs.onChange(() => {
      changes += 1;
    });
    // Its views made already, only the front moves.
    await window.profiles.select("a");

    expect([window.fronts(), changes]).toStrictEqual([4, 1]);
    window.tabs.focuser()?.();
    window.tabs.focuser()?.();

    expect(
      window.views.map((view) => [view.partition, view.focuses])
    ).toStrictEqual([
      ["persist:a", 0],
      ["persist:a", 2],
      ["persist:b", 0],
    ]);

    window.emit(window.viewOf("persist:a", 1), REFUSED);

    expect(window.tabs.focuser()).toBeUndefined();
  });

  it("selects a pane's tab when the person presses on its page, but not when its page takes focus, as one can as it first loads, telling of that focus as taken unasked and focusing no view itself", async () => {
    const [profile, other] = initial.profiles as [
      State["profiles"][number],
      State["profiles"][number],
    ];
    const window = await setup({
      state: {
        ...initial,
        profiles: [
          {
            ...profile,
            splits: [
              {
                root: {
                  direction: "row",
                  children: [
                    { size: 0.5, pane: "gmail" },
                    { size: 0.5, pane: "c1" },
                  ],
                },
              },
            ],
          },
          other,
        ],
      },
    });
    const selected = () => window.profiles.get().profiles[0]?.selectedTabId;
    const gmail = window.viewOf("persist:a", 0);
    const calendar = window.viewOf("persist:a", 1);

    gmail?.options.onFocus();
    calendar?.options.onFocus();
    await vi.advanceTimersByTimeAsync(0);

    // Focus alone selects nothing, and no view is focused here: main gives
    // focus back once the window may take it.
    const afterFocus = [
      selected(),
      gmail?.focuses,
      calendar?.focuses,
      [...window.focusEvents],
    ];

    calendar?.options.onPointerDown();
    await vi.advanceTimersByTimeAsync(0);

    expect([afterFocus, selected()]).toStrictEqual([
      ["gmail", 0, 0, ["front", "stray"]],
      "c1",
    ]);
  });

  it("tells of focus a hidden tab's page takes as taken unasked, never as the front page's, as on Windows one can as it first loads", async () => {
    const window = await setup();

    await window.profiles.selectTab({ profileId: "a", tabId: "c1" });
    await window.profiles.selectTab({ profileId: "a", tabId: "gmail" });
    const calendar = window.viewOf("persist:a", 1);
    const hidden = calendar?.visible;

    calendar?.options.onFocus();
    window.viewOf("persist:a", 0)?.options.onFocus();

    expect([hidden, [...window.focusEvents]]).toStrictEqual([
      false,
      ["stray", "front"],
    ]);
  });

  it("moves a tab's view to its own window and back without reloading it, Gmail's coming to the front meanwhile", async () => {
    const window = await setup();
    const calendar = { profileId: "a", tabId: "c1" };

    await window.profiles.selectTab(calendar);
    const view = window.viewOf("persist:a", 1);

    await window.profiles.moveToOwnWindow(calendar);
    const away = [
      view?.host,
      view?.bounds.at(-1),
      view?.visible,
      window.tabs.windowTabs(),
      window.viewOf("persist:a", 0)?.visible,
    ];

    await window.profiles.moveToMainWindow(calendar, true);

    expect([
      away,
      [view?.host, view?.visible, view?.loaded.length, view?.reloads],
      window.tabs.windowTabs(),
      window.windowEvents,
    ]).toStrictEqual([
      [2, { x: 8, y: 40, width: 984, height: 652 }, true, [calendar], true],
      [MAIN_HOST, true, 1, 0],
      [],
      ["open a/c1", "moved a/c1", "moved a/c1", "close a/c1"],
    ]);
  });

  it("loads a tab moved out before it ever loaded in its window, and closes the window with the tab", async () => {
    const window = await setup();
    const calendar = { profileId: "a", tabId: "c1" };

    await window.profiles.moveToOwnWindow(calendar);
    const view = window.viewOf("persist:a", 1);
    const opened = [view?.host, view?.loaded, view?.visible];

    await window.profiles.closeTab(calendar);

    expect([opened, view?.closed, window.windowEvents]).toStrictEqual([
      [2, [CALENDAR], true],
      true,
      ["open a/c1", "moved a/c1", "close a/c1"],
    ]);
  });

  it("tells of focus on a page in its own window as that window's, never selecting it, and places it again when its window resizes", async () => {
    const window = await setup();
    const calendar = { profileId: "a", tabId: "c1" };

    await window.profiles.moveToOwnWindow(calendar);
    const view = window.viewOf("persist:a", 1);
    const placed = view?.bounds.length ?? 0;

    view?.options.onFocus();
    view?.options.onPointerDown();
    await vi.advanceTimersByTimeAsync(0);
    window.resizeOwnWindow(calendar);
    window.tabs.ownWindowFocuser(calendar)?.();

    expect([
      window.focusEvents,
      window.profiles.get().profiles[0]?.selectedTabId,
      (view?.bounds.length ?? 0) > placed,
      view?.focuses,
    ]).toStrictEqual([["window a/c1"], "gmail", true, 1]);
  });

  it("throws nothing and places nothing once the main window is gone, as Meru quits", async () => {
    const window = await setup();
    const calendar = { profileId: "a", tabId: "c1" };

    await window.profiles.moveToOwnWindow(calendar);
    window.destroyMain();
    window.resizeTo({ width: 900, height: 600 });

    await expect(
      window.profiles.moveToMainWindow(calendar, false)
    ).resolves.toBeTruthy();
    expect(window.windowEvents).toStrictEqual(["open a/c1", "moved a/c1"]);
  });

  it("closes a sleeping profile's own windows, the tab back in the main window with its view closed", async () => {
    const window = await setup();
    const calendar = { profileId: "a", tabId: "c1" };

    await window.profiles.moveToOwnWindow(calendar);
    const view = window.viewOf("persist:a", 1);

    await window.profiles.select("b");
    await window.profiles.sleep("a");

    expect([
      view?.closed,
      window.windowEvents,
      window.profiles
        .get()
        .profiles[0]?.tabs.some((each) => "ownWindow" in each),
    ]).toStrictEqual([true, ["open a/c1", "moved a/c1", "close a/c1"], false]);
  });

  it("gives another profile's selected tab a view of its session when that profile is selected", async () => {
    const window = await setup();

    await window.profiles.select("b");

    expect(window.live()).toStrictEqual([
      ["persist:a", GMAIL, false],
      ["persist:b", GMAIL, true],
    ]);
  });

  it("hides a tab whose load failed, retries after a second, then two, and at once when the network returns", async () => {
    const window = await setup();
    const gmail = window.viewOf("persist:a");

    window.emit(gmail, REFUSED);

    expect(gmail?.visible).toBeFalsy();
    expect(
      window.tabs.status({ profileId: "a", tabId: "gmail" })
    ).toMatchObject({
      kind: "failed",
      reason: { name: "ERR_CONNECTION_REFUSED" },
    });

    const timeline: [string, number, boolean | undefined][] = [];
    const sample = (moment: string) =>
      timeline.push([moment, gmail?.loaded.length ?? 0, gmail?.visible]);

    await vi.advanceTimersByTimeAsync(999);
    sample("999ms");
    await vi.advanceTimersByTimeAsync(1);
    // Retrying keeps the view hidden, so the shell keeps saying why.
    sample("1s");
    window.emit(gmail, REFUSED);
    await vi.advanceTimersByTimeAsync(1999);
    sample("2s less 1ms later");
    window.goOnline();
    sample("online");
    window.emit(gmail, { kind: "loaded" });
    // The retry the network's return overtook never comes.
    await vi.advanceTimersByTimeAsync(60_000);
    sample("loaded, a minute on");

    expect(timeline).toStrictEqual([
      ["999ms", 1, false],
      ["1s", 2, false],
      ["2s less 1ms later", 2, false],
      ["online", 3, false],
      ["loaded, a minute on", 3, true],
    ]);
  });

  it("retries a failed tab at once when asked", async () => {
    const window = await setup();
    const gmail = window.viewOf("persist:a");

    window.emit(gmail, REFUSED);
    window.tabs.retry({ profileId: "a", tabId: "gmail" });

    expect(gmail?.loaded).toStrictEqual([GMAIL, GMAIL]);
  });

  it("hides a crashed tab and reloads it when asked", async () => {
    const window = await setup();
    const gmail = window.viewOf("persist:a");

    window.emit(gmail, { kind: "loaded" });
    window.emit(gmail, { kind: "crashed", reason: "killed" });

    expect(gmail?.visible).toBeFalsy();
    expect(
      window.tabs.status({ profileId: "a", tabId: "gmail" })
    ).toStrictEqual({ kind: "crashed", reason: "killed" });

    window.tabs.retry({ profileId: "a", tabId: "gmail" });

    expect(gmail?.loaded).toHaveLength(2);
    expect(gmail?.visible).toBeTruthy();
  });

  it("reloads a tab that crashed in the background when it is selected", async () => {
    const window = await setup();
    const gmail = window.viewOf("persist:a");

    await window.profiles.selectTab({ profileId: "a", tabId: "c1" });
    window.emit(gmail, { kind: "crashed", reason: "oom" });
    expect(gmail?.loaded).toHaveLength(1);

    await window.profiles.selectTab({ profileId: "a", tabId: "gmail" });

    expect(gmail?.loaded).toHaveLength(2);
  });

  it("opens a claimed link as a tab in the same session, selected, loading the link", async () => {
    const window = await setup();
    const gmail = window.viewOf("persist:a");
    const link = "https://drive.google.com/file/d/1";

    expect(gmail?.options.onWindowOpen(link)).toBe("deny");
    await vi.advanceTimersByTimeAsync(0);

    const [tabs] = window.profiles.get().profiles;

    expect(tabs && knownTabs(tabs).map((tab) => tab.id)).toStrictEqual([
      "gmail",
      "c1",
      "new-1",
    ]);
    expect(tabs?.selectedTabId).toBe("new-1");
    expect(window.live()).toStrictEqual([
      ["persist:a", GMAIL, false],
      ["persist:a", link, true],
    ]);
    expect(window.opened).toStrictEqual([]);
  });

  it("lets Gmail's own pop-outs open as windows", async () => {
    const window = await setup();
    const { onWindowOpen } = window.viewOf("persist:a")?.options ?? {};

    expect(
      [`${GMAIL}/popout?ver=1`, `${GMAIL}/?view=lg`].map((url) =>
        onWindowOpen?.(url)
      )
    ).toStrictEqual(["allow", "allow"]);
    expect(window.opened).toStrictEqual([]);
  });

  it("has the page download a Chat attachment, and opens the PDF viewer as a window unless asked for behind the page", async () => {
    const window = await setup();
    const { onWindowOpen } = window.viewOf("persist:a")?.options ?? {};
    const viewer =
      "https://1a2b-apps-viewer.googleusercontent.com/viewer/secure/pdf/1";

    expect([
      onWindowOpen?.("https://chat.google.com/u/0/api/get_attachment_url?x=1"),
      onWindowOpen?.(viewer),
      onWindowOpen?.(viewer, { inBackground: false }),
      onWindowOpen?.(viewer, { inBackground: true }),
    ]).toStrictEqual(["download", "allow", "allow", "deny"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(window.opened).toStrictEqual([viewer]);
  });

  it("closes a tab a link opened whose page started a download before it showed anything, selecting the tab of that link again", async () => {
    const window = await setup();
    const gmail = window.viewOf("persist:a");

    gmail?.options.onWindowOpen("https://drive.google.com/uc?export=download");
    await vi.advanceTimersByTimeAsync(0);

    const opened = window.viewOf("persist:a", 1);

    expect(window.profiles.get().profiles[0]?.selectedTabId).toBe("new-1");
    window.tabs.closeIfOnlyDownloading(opened?.webContentsId ?? 0);
    await vi.advanceTimersByTimeAsync(0);

    const [profile] = window.profiles.get().profiles;

    expect([
      profile && knownTabs(profile).map((tab) => tab.id),
      profile?.selectedTabId,
      window.logs.at(-1),
    ]).toStrictEqual([
      ["gmail", "c1"],
      "gmail",
      "Closed a tab opened only to start a download",
    ]);
  });

  it("leaves the selection where it is when a download-only tab closes after another was selected", async () => {
    const window = await setup();
    const gmail = window.viewOf("persist:a");

    gmail?.options.onWindowOpen("https://drive.google.com/uc?export=download");
    await vi.advanceTimersByTimeAsync(0);

    const opened = window.viewOf("persist:a", 1);

    await window.profiles.selectTab({ profileId: "a", tabId: "c1" });
    window.tabs.closeIfOnlyDownloading(opened?.webContentsId ?? 0);
    await vi.advanceTimersByTimeAsync(0);

    const [profile] = window.profiles.get().profiles;

    expect([
      profile && knownTabs(profile).map((tab) => tab.id),
      profile?.selectedTabId,
    ]).toStrictEqual([["gmail", "c1"], "c1"]);
  });

  it("keeps a tab whose page showed before it downloaded, and one no link opened", async () => {
    const window = await setup();
    const gmail = window.viewOf("persist:a");

    gmail?.options.onWindowOpen("https://drive.google.com/file/d/1");
    await vi.advanceTimersByTimeAsync(0);

    const opened = window.viewOf("persist:a", 1);

    window.emit(opened, {
      kind: "navigated",
      url: "https://drive.google.com/file/d/1",
      inPage: false,
    });
    window.tabs.closeIfOnlyDownloading(opened?.webContentsId ?? 0);
    window.tabs.closeIfOnlyDownloading(gmail?.webContentsId ?? 0);
    await vi.advanceTimersByTimeAsync(0);

    const [profile] = window.profiles.get().profiles;

    expect(profile && knownTabs(profile).map((tab) => tab.id)).toStrictEqual([
      "gmail",
      "c1",
      "new-1",
    ]);
  });

  it("sends Gmail's tab to a Gmail link another tab opens", async () => {
    const window = await setup();
    const gmail = window.viewOf("persist:a");
    const link = `${GMAIL}/#inbox/abc`;

    window.emit(gmail, { kind: "loaded" });
    await window.profiles.selectTab({ profileId: "a", tabId: "c1" });

    const calendar = window.viewOf("persist:a", 1);

    expect(calendar?.options.onWindowOpen(link)).toBe("deny");
    await vi.advanceTimersByTimeAsync(0);

    expect(window.profiles.get().profiles[0]?.selectedTabId).toBe("gmail");
    expect(gmail?.loaded).toStrictEqual([GMAIL, link]);
    expect(gmail?.visible).toBeTruthy();
  });

  it("opens a Gmail link in an unloaded Gmail tab with one load, of the link", async () => {
    const window = await setup({
      state: {
        ...initial,
        profiles: [
          {
            ...newProfile("a", "Default"),
            tabs: [
              {
                ...gmailTab(),
                url: `${GMAIL}/#inbox/kept`,
                openAtLaunch: false,
              },
              { id: "c1", app: "calendar", url: CALENDAR, title: "Week" },
            ],
            selectedTabId: "c1",
          },
        ],
      },
    });
    const link = `${GMAIL}/#inbox/abc`;

    // Calendar is in front, and Gmail, off at launch, has no view yet.
    expect(window.live()).toStrictEqual([["persist:a", CALENDAR, true]]);

    window.viewOf("persist:a")?.options.onWindowOpen(link);
    await vi.advanceTimersByTimeAsync(0);

    expect(window.viewOf("persist:a", 1)?.loaded).toStrictEqual([link]);
  });

  it("opens a Gmail link where Gmail was closed as Gmail's tab again, loading the link once", async () => {
    const window = await setup({
      state: {
        ...initial,
        profiles: [
          {
            ...newProfile("a", "Default"),
            tabs: [{ id: "c1", app: "calendar", url: CALENDAR, title: "Week" }],
            selectedTabId: "c1",
          },
        ],
      },
    });
    const link = `${GMAIL}/#inbox/abc`;

    window.viewOf("persist:a")?.options.onWindowOpen(link);
    await vi.advanceTimersByTimeAsync(0);

    expect([
      window.profiles.get().profiles[0]?.selectedTabId,
      window.viewOf("persist:a", 1)?.loaded,
    ]).toStrictEqual(["gmail", [link]]);
  });

  it("opens sign-in as a child window, other links in the system browser, and refuses the rest", async () => {
    const window = await setup();
    const { onWindowOpen } = window.views[0]?.options ?? {};

    expect(
      [
        "https://accounts.google.com/signin",
        "https://example.com/",
        "https://www.google.com/url?q=https://example.com/a",
        "file:///etc/passwd",
      ].map((url) => onWindowOpen?.(url))
    ).toStrictEqual(["allow", "deny", "deny", "deny"]);
    expect(window.opened).toStrictEqual([
      "https://example.com/",
      "https://example.com/a",
    ]);
    expect(window.logs).toStrictEqual(["Refused a window a page asked for"]);
  });

  it("answers adding a Google account with a new profile, opening no window", async () => {
    const window = await setup();
    const { onWindowOpen } = window.views[0]?.options ?? {};

    expect(
      onWindowOpen?.("https://accounts.google.com/AddSession?continue=x")
    ).toBe("deny");
    await vi.advanceTimersByTimeAsync(0);

    expect(window.profilesAdded()).toBe(1);
    expect(window.opened).toStrictEqual([]);
  });

  it("adds one profile for a burst of requests to add an account, and another a second after", async () => {
    const window = await setup();
    const { onWindowOpen } = window.views[0]?.options ?? {};
    const addSession = "https://accounts.google.com/AddSession?continue=x";

    for (let n = 0; n < 4; n += 1) {
      onWindowOpen?.(addSession);
    }

    await vi.advanceTimersByTimeAsync(999);
    onWindowOpen?.(addSession);
    expect(window.profilesAdded()).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    onWindowOpen?.(addSession);
    await vi.advanceTimersByTimeAsync(0);

    expect(window.profilesAdded()).toBe(2);
    expect(window.logs).toStrictEqual(
      Array.from(
        { length: 4 },
        () => "Dropped a repeated request to add an account"
      )
    );
  });

  it("keeps a window a page opened on its app and sign-in, routing anywhere else as a link", async () => {
    const window = await setup();
    const { onChildNavigation } = window.views[0]?.options ?? {};

    expect(
      [
        `${GMAIL}/popout?ver=1`,
        "https://accounts.google.com/signin",
        "https://example.com/",
        "https://www.google.com/url?q=https://example.com/b",
        `${"javascript"}:alert(1)`,
        "https://drive.google.com/file/d/1",
      ].map((url) => onChildNavigation?.(url))
    ).toStrictEqual(["allow", "allow", "deny", "deny", "deny", "deny"]);
    await vi.advanceTimersByTimeAsync(0);

    expect(window.opened).toStrictEqual([
      "https://example.com/",
      "https://example.com/b",
    ]);
    expect(window.profiles.get().profiles[0]?.selectedTabId).toBe("new-1");
    expect(window.logs).toStrictEqual(
      Array.from(
        { length: 4 },
        () => "Kept a window a page opened from leaving its app"
      )
    );
  });

  it("closes a closed tab's view and drops its pending retry", async () => {
    const window = await setup();

    await window.profiles.selectTab({ profileId: "a", tabId: "c1" });

    const calendar = window.viewOf("persist:a", 1);

    window.emit(calendar, REFUSED);
    await window.profiles.closeTab({ profileId: "a", tabId: "c1" });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(calendar?.closed).toBeTruthy();
    expect(calendar?.loaded).toHaveLength(1);
    // The next profile's Gmail, its turn come with the minute.
    expect(window.live()).toStrictEqual([
      ["persist:a", GMAIL, true],
      ["persist:b", GMAIL, false],
    ]);
  });

  it("leaves no front, telling of it, and nothing to focus once the last tab closes", async () => {
    const window = await setup();
    const gmail = { profileId: "a", tabId: "gmail" };

    await window.profiles.closeTab({ profileId: "a", tabId: "c1" });
    await window.profiles.setPinned(gmail, false);
    await window.profiles.closeTab(gmail);

    expect([
      window.live(),
      window.fronts(),
      window.tabs.focuser(),
      window.tabs.navigation(),
    ]).toStrictEqual([[], 2, undefined, null]);
  });

  it("closes the views of every tab of a removed profile", async () => {
    const window = await setup();

    await window.profiles.select("b");
    await window.profiles.remove("a");

    expect(window.live()).toStrictEqual([["persist:b", GMAIL, true]]);
  });

  it("keeps each tab's URL and title in state, written at most once a second", async () => {
    const window = await setup();
    const gmail = window.viewOf("persist:a");
    const before = window.saves.length;

    window.emit(gmail, {
      kind: "navigated",
      url: `${GMAIL}/#inbox`,
      inPage: true,
    });
    window.emit(gmail, { kind: "titled", title: "Inbox" });
    window.emit(gmail, {
      kind: "navigated",
      url: `${GMAIL}/#sent`,
      inPage: true,
    });
    window.emit(gmail, { kind: "titled", title: "Sent" });
    await vi.advanceTimersByTimeAsync(0);

    // The first change at once, the rest when the second is up.
    expect(window.saves.length - before).toBe(1);

    await vi.advanceTimersByTimeAsync(1000);

    expect(window.saves.length - before).toBe(2);
    expect(window.profiles.get().profiles[0]?.tabs[0]).toMatchObject({
      url: `${GMAIL}/#sent`,
      title: "Sent",
    });

    await vi.advanceTimersByTimeAsync(5000);
    expect(window.saves.length - before).toBe(2);
  });

  it("answers where a tab's page is and what it is called now, ahead of state, its title cleared by a new document and nothing with no view", async () => {
    const window = await setup();
    const gmail = window.viewOf("persist:a");
    const key = { profileId: "a", tabId: "gmail" };
    const page = () => window.tabs.page(key);
    const seen = [page()];

    window.emit(gmail, {
      kind: "navigated",
      url: `${GMAIL}/#inbox`,
      inPage: true,
    });
    window.emit(gmail, { kind: "titled", title: "Inbox" });
    seen.push(page());
    window.emit(gmail, { kind: "navigated", url: `${GMAIL}/next` });
    seen.push(page(), window.tabs.page({ profileId: "a", tabId: "none" }));

    expect(seen).toStrictEqual([
      { url: "", title: undefined },
      { url: `${GMAIL}/#inbox`, title: "Inbox" },
      { url: `${GMAIL}/next`, title: "" },
      undefined,
    ]);
  });

  it("tells of each load a tab's page finishes and each title it takes, but not an error page's", async () => {
    const window = await setup();
    const gmail = window.viewOf("persist:a");
    const key = { profileId: "a", tabId: "gmail" };

    window.emit(gmail, { kind: "loaded" });
    window.emit(gmail, { kind: "titled", title: "Inbox (2)" });
    window.emit(gmail, REFUSED);
    window.emit(gmail, { kind: "titled", title: "mail.google.com" });

    expect(window.pageChanges).toStrictEqual([key, key]);
  });

  it("hands each finished load the tab's own page to read, and no error page's", async () => {
    const window = await setup();
    const gmail = window.viewOf("persist:a");

    window.emit(gmail, { kind: "navigated", url: GMAIL });
    window.emit(gmail, { kind: "loaded" });
    window.emit(gmail, REFUSED);

    expect(window.loads.map(({ key }) => key)).toStrictEqual([
      { profileId: "a", tabId: "gmail" },
    ]);
    await expect(window.loads[0]?.page.evaluate("1")).resolves.toBe(
      "persist:a"
    );
    expect(window.loads[0]?.page.url()).toBe(GMAIL);
  });

  it("keeps no URL or title of the page shown while a tab failed or crashed", async () => {
    const window = await setup();
    const gmail = window.viewOf("persist:a");
    const before = window.profiles.get().profiles[0]?.tabs[0];

    window.emit(gmail, REFUSED);
    window.emit(gmail, { kind: "titled", title: "mail.google.com" });
    window.emit(gmail, { kind: "crashed", reason: "killed" });
    window.emit(gmail, {
      kind: "navigated",
      url: "chrome-error://chromewebdata/",
    });
    await vi.advanceTimersByTimeAsync(5000);

    expect(window.profiles.get().profiles[0]?.tabs[0]).toStrictEqual(before);
  });

  it("moves every view, hidden ones too, when the content area resizes", async () => {
    const window = await setup();

    await window.profiles.selectTab({ profileId: "a", tabId: "c1" });
    window.resizeTo({ width: 900, height: 600 });

    for (const view of window.views) {
      expect(view.bounds.at(-1)).toStrictEqual({
        x: 224,
        y: 40,
        width: 668,
        height: 552,
      });
    }
  });

  it("puts a profile's pages but Gmail's to sleep, then loads its pages again and its front tab woken, leaving another profile's alone", async () => {
    const window = await setup();
    const calendar = { profileId: "a", tabId: "c1" };

    await window.profiles.selectTab(calendar);
    await vi.advanceTimersByTimeAsync(60_000);

    const gmail = window.viewOf("persist:a");
    const first = window.viewOf("persist:a", 1);
    const other = window.viewOf("persist:b");

    window.tabs.sleepAllButGmail("a");

    const asleep = [gmail?.closed, first?.closed, window.live()];

    window.tabs.reloadProfile("a");

    expect([
      asleep,
      gmail?.reloads,
      other?.reloads,
      window.live(),
    ]).toStrictEqual([
      [
        false,
        true,
        [
          ["persist:a", GMAIL, false],
          ["persist:b", GMAIL, false],
        ],
      ],
      1,
      0,
      [
        ["persist:a", GMAIL, false],
        ["persist:b", GMAIL, false],
        ["persist:a", CALENDAR, true],
      ],
    ]);
  });

  it("gives both panes of a split their pages again after putting all but Gmail's to sleep", async () => {
    const [profile, other] = initial.profiles as [
      State["profiles"][number],
      State["profiles"][number],
    ];
    const window = await setup({
      state: {
        ...initial,
        profiles: [
          {
            ...profile,
            splits: [
              {
                root: {
                  direction: "row",
                  children: [
                    { size: 0.5, pane: "gmail" },
                    { size: 0.5, pane: "c1" },
                  ],
                },
              },
            ],
          },
          other,
        ],
      },
    });

    // Gmail in front, so the calendar is only the pane beside it.
    await window.profiles.selectTab({ profileId: "a", tabId: "gmail" });
    window.tabs.sleepAllButGmail("a");

    const asleep = window
      .live()
      .filter(([partition]) => partition === "persist:a");

    window.tabs.reloadProfile("a");

    expect([
      asleep,
      window.live().filter(([partition]) => partition === "persist:a"),
    ]).toStrictEqual([
      [["persist:a", GMAIL, true]],
      [
        ["persist:a", GMAIL, true],
        ["persist:a", CALENDAR, true],
      ],
    ]);
  });

  it("keeps the page of a tab in its own window through putting a profile's pages to sleep, and reloads it after", async () => {
    const window = await setup();
    const calendar = { profileId: "a", tabId: "c1" };

    await window.profiles.selectTab(calendar);

    const view = window.viewOf("persist:a", 1);

    await window.profiles.moveToOwnWindow(calendar);
    window.tabs.sleepAllButGmail("a");

    const kept = [view?.closed, window.tabs.windowTabs()];

    window.tabs.reloadProfile("a");

    expect([kept, view?.reloads]).toStrictEqual([[false, [calendar]], 1]);
  });

  it("puts a background tab to sleep, closing its view and any retry, and loads it where it was when it is selected", async () => {
    const window = await setup();
    const calendar = { profileId: "a", tabId: "c1" };
    const elsewhere = `${CALENDAR}?day=2`;

    await window.profiles.selectTab(calendar);

    const first = window.viewOf("persist:a", 1);

    window.emit(first, { kind: "navigated", url: elsewhere });
    window.emit(first, REFUSED);
    await window.profiles.selectTab({ profileId: "a", tabId: "gmail" });
    window.tabs.sleep(calendar);
    await vi.advanceTimersByTimeAsync(60_000);

    expect([first?.closed, first?.loaded]).toStrictEqual([true, [CALENDAR]]);
    expect(window.tabs.status(calendar)).toStrictEqual({ kind: "unloaded" });
    // The next profile's Gmail, its turn come with the minute.
    expect(window.live()).toStrictEqual([
      ["persist:a", GMAIL, true],
      ["persist:b", GMAIL, false],
    ]);

    await window.tabs.select(calendar);

    expect(window.live()).toStrictEqual([
      ["persist:a", GMAIL, false],
      ["persist:b", GMAIL, false],
      ["persist:a", elsewhere, true],
    ]);
  });

  it("keeps the front tab put to sleep in front with no page, and loads it again when woken, Gmail at its inbox", async () => {
    const window = await setup();
    const gmail = { profileId: "a", tabId: "gmail" };
    const view = window.viewOf("persist:a");

    window.emit(view, { kind: "loaded" });
    window.emit(view, { kind: "navigated", url: `${GMAIL}/#inbox/later` });
    window.tabs.sleep(gmail);

    expect([
      view?.closed,
      window.live(),
      window.fronts(),
      window.tabs.focuser(),
      window.tabs.navigation(),
      window.tabs.status(gmail),
    ]).toStrictEqual([true, [], 2, undefined, null, { kind: "unloaded" }]);

    // Selecting what is selected already, as a click on it does, wakes it.
    await window.tabs.select(gmail);

    // Gmail done loading, the next profile's Open at Launch Gmail opened.
    expect([window.live(), window.fronts()]).toStrictEqual([
      [
        ["persist:a", GMAIL, true],
        ["persist:b", GMAIL, false],
      ],
      3,
    ]);
    expect(window.tabs.focuser()).toBeDefined();
  });

  it("tells of no change while a tab it loads still reads unloaded", async () => {
    const window = await setup();
    const calendar = { profileId: "a", tabId: "c1" };
    const seen: string[] = [];

    window.tabs.onChange(() => {
      seen.push(window.tabs.status(calendar).kind);
    });
    await window.profiles.selectTab(calendar);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain("unloaded");
  });

  it("wakes a tab where its page was, even before that was written to state", async () => {
    const window = await setup();
    const calendar = { profileId: "a", tabId: "c1" };
    const later = `${CALENDAR}?day=3`;

    await window.profiles.selectTab(calendar);

    const view = window.viewOf("persist:a", 1);

    window.emit(view, { kind: "loaded" });
    window.emit(view, { kind: "navigated", url: `${CALENDAR}?day=2` });
    window.emit(view, { kind: "navigated", url: later });
    window.tabs.sleep(calendar);

    // Written at once, not when the page writer's second is up.
    await vi.advanceTimersByTimeAsync(0);

    expect(window.profiles.get().profiles[0]?.tabs[1]).toMatchObject({
      url: later,
    });

    window.tabs.reloadFront();

    expect(window.viewOf("persist:a", 1)?.loaded).toStrictEqual([later]);
  });

  it("wakes a tab put to sleep while it loaded a link at the link, before its page committed any URL", async () => {
    const window = await setup();
    const link = `${CALENDAR}?day=5`;
    const calendarApp = APPS.find((app) => app.id === "calendar");

    if (calendarApp) {
      await window.tabs.open("a", calendarApp, link);
    }

    const opened = window.profiles.get().profiles[0]?.selectedTabId ?? "";

    window.tabs.sleep({ profileId: "a", tabId: opened });
    window.tabs.reloadFront();

    expect(window.live()).toStrictEqual([
      ["persist:a", GMAIL, false],
      ["persist:a", link, true],
    ]);
  });

  it("wakes a loaded tab sent a link and put to sleep before the link committed at the link", async () => {
    const window = await setup();
    const gmail = { profileId: "a", tabId: "gmail" };
    const view = window.viewOf("persist:a");
    const link = `${GMAIL}/#inbox/abc`;
    const gmailApp = APPS.find((app) => app.id === "gmail");

    window.emit(view, { kind: "navigated", url: GMAIL });
    window.emit(view, { kind: "loaded" });

    if (gmailApp) {
      await window.tabs.open("a", gmailApp, link);
    }

    expect(view?.loaded).toStrictEqual([GMAIL, link]);

    window.tabs.sleep(gmail);
    window.tabs.reloadFront();

    expect(window.viewOf("persist:a")?.loaded).toStrictEqual([link]);
  });

  it("forgets where a tab put to sleep was to wake when it is closed asleep", async () => {
    const window = await setup();
    const gmail = { profileId: "a", tabId: "gmail" };
    const link = `${GMAIL}/#inbox/abc`;
    const gmailApp = APPS.find((app) => app.id === "gmail");

    if (!gmailApp) {
      throw new Error("The registry has no Gmail");
    }

    // Asleep before the link committed, so it would wake at the link.
    await window.tabs.open("a", gmailApp, link);
    window.tabs.sleep(gmail);
    await window.profiles.setPinned(gmail, false);
    await window.profiles.closeTab(gmail);
    await window.profiles.openTab("a", gmailApp, GMAIL, "gmail");

    expect(window.viewOf("persist:a", 1)?.loaded).toStrictEqual([GMAIL]);
  });

  it("wakes the sleeping front tab by Reload, and selects and wakes a background one by its Reload", async () => {
    const window = await setup();
    const gmail = { profileId: "a", tabId: "gmail" };
    const calendar = { profileId: "a", tabId: "c1" };

    window.tabs.sleep(gmail);
    window.tabs.reloadFront();

    // Gmail put to sleep is no longer loading, so the next profile's opened.
    expect(window.live()).toStrictEqual([
      ["persist:a", GMAIL, true],
      ["persist:b", GMAIL, false],
    ]);

    await window.tabs.reload(calendar);

    expect([
      window.profiles.get().profiles[0]?.selectedTabId,
      window.live(),
    ]).toStrictEqual([
      "c1",
      [
        ["persist:a", GMAIL, false],
        ["persist:b", GMAIL, false],
        ["persist:a", CALENDAR, true],
      ],
    ]);
  });

  it("wakes the sleeping front tab on a link opened in it, loading the link once", async () => {
    const window = await setup();
    const gmail = { profileId: "a", tabId: "gmail" };
    const link = `${GMAIL}/#inbox/abc`;
    const gmailApp = APPS.find((app) => app.id === "gmail");

    window.tabs.sleep(gmail);

    if (gmailApp) {
      await window.tabs.open("a", gmailApp, link);
    }

    expect(window.live()).toStrictEqual([
      ["persist:a", link, true],
      ["persist:b", GMAIL, false],
    ]);
    expect(window.viewOf("persist:a")?.loaded).toStrictEqual([link]);
  });

  it("wakes a sleeping tab when another profile's selection brings it to the front again", async () => {
    const window = await setup();
    const gmail = { profileId: "a", tabId: "gmail" };

    window.tabs.sleep(gmail);
    await window.profiles.select("b");
    await window.profiles.select("a");

    expect(window.live()).toStrictEqual([
      ["persist:b", GMAIL, false],
      ["persist:a", GMAIL, true],
    ]);
  });

  it("puts a background profile to sleep, every view of it gone and its place kept, and wakes it at its first selection's tabs", async () => {
    const window = await setup();
    const calendar = { profileId: "a", tabId: "c1" };
    const later = `${CALENDAR}?day=4`;

    await window.profiles.selectTab(calendar);

    const view = window.viewOf("persist:a", 1);

    window.emit(view, { kind: "navigated", url: later });
    window.emit(view, { kind: "loaded" });
    await window.profiles.select("b");
    await window.profiles.sleep("a");

    expect(window.live()).toStrictEqual([["persist:b", GMAIL, true]]);
    expect(window.tabs.status(calendar)).toStrictEqual({ kind: "unloaded" });

    // Calendar, selected, loads where it was, and Gmail opens at launch again.
    await window.profiles.select("a");

    expect(window.live()).toStrictEqual([
      ["persist:b", GMAIL, false],
      ["persist:a", GMAIL, false],
      ["persist:a", later, true],
    ]);
  });

  it("keeps the only profile awake, its views in place, when asked to put it to sleep", async () => {
    const window = await setup({
      state: { ...initial, profiles: initial.profiles.slice(0, 1) },
    });

    await window.profiles.sleep("a");

    expect(window.live()).toStrictEqual([["persist:a", GMAIL, true]]);
  });

  it("loads a profile stored asleep while selected, which reads as awake, and nothing of one stored asleep in the background, even after the selection moves", async () => {
    const window = await setup({
      state: {
        ...initial,
        profiles: initial.profiles.map((profile) => ({
          ...profile,
          asleep: true,
        })),
      },
    });

    expect(window.live()).toStrictEqual([["persist:a", GMAIL, true]]);

    // Its key goes as the selection moves, so it stays awake.
    await window.profiles.select("b");

    expect(window.live()).toStrictEqual([
      ["persist:a", GMAIL, false],
      ["persist:b", GMAIL, true],
    ]);
  });

  it("reloads the front tab's page where it is, and a failed one from its URL", async () => {
    const window = await setup();
    const gmail = window.viewOf("persist:a");

    window.emit(gmail, { kind: "loaded" });
    window.tabs.reloadFront();

    expect([gmail?.reloads, gmail?.loaded]).toStrictEqual([1, [GMAIL]]);
    expect(
      window.tabs.status({ profileId: "a", tabId: "gmail" })
    ).toStrictEqual({ kind: "loading" });

    window.emit(gmail, REFUSED);
    window.tabs.reloadFront();

    expect([gmail?.reloads, gmail?.loaded]).toStrictEqual([1, [GMAIL, GMAIL]]);
  });

  it("rounds every view's corners by 8px, and moves every view as the sidebar changes, loading nothing", async () => {
    const window = await setup();

    await window.profiles.selectTab({ profileId: "a", tabId: "c1" });

    expect(window.views.map((view) => view.radii.at(-1))).toStrictEqual([8, 8]);

    const loads = window.views.map((view) => view.loaded.length);

    window.setSidebar("hidden");

    for (const view of window.views) {
      expect(view.bounds.at(-1)).toStrictEqual({
        x: 8,
        y: 40,
        width: 1264,
        height: 752,
      });
    }

    expect(window.views.map((view) => view.loaded.length)).toStrictEqual(loads);
  });
});
