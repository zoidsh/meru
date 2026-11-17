import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { APPS } from "#core/apps.ts";
import type { SidebarState } from "#core/sidebar.ts";
import { gmailTab, knownTabs, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
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
import { createTabViews } from "./tab-views.ts";
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
  reloads: number;
  visible: boolean | undefined;
  closed: boolean;
  focuses: number;
  /** What the page answers of its history and load, and what was asked of it. */
  navigation: Navigation;
  moves: string[];
}

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
  let inboxOpen = false;
  let profilesAdded = 0;
  const pageChanges: TabKey[] = [];
  const loads: { key: TabKey; page: LoadedPage }[] = [];

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
    window: {
      getContentAreaSize: () => size,
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
          reloads: 0,
          visible: undefined,
          closed: false,
          focuses: 0,
          navigation: { canGoBack: false, canGoForward: false, loading: false },
          moves: [],
        };

        views.push(view);
        webContentsIds += 1;
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
          url: () => view.loaded.at(-1) ?? "",
          evaluate: () => Promise.resolve(view.partition),
          loadURL: (url) => {
            view.loaded.push(url);

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
    inboxOpen: () => inboxOpen,
    openTab: profiles.openTab,
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
    onFocus: () => false,
    onFront: () => {
      fronts += 1;
    },
    onPageChange: (key) => {
      pageChanges.push(key);
    },
    onLoaded: (key, page) => {
      loads.push({ key, page });
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
      view?.options.onEvent(event);
    },
    goOnline: () => online?.(),
    fronts: () => fronts,
    profilesAdded: () => profilesAdded,
    pageChanges,
    loads,
    setSidebar: (next: SidebarState) => {
      sidebar = next;
      tabs.relayout();
    },
    resizeTo: (next: Size) => {
      size = next;
      resize?.();
    },
    setInboxOpen: (open: boolean) => {
      inboxOpen = open;
      tabs.reconcile(profiles.get());
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

  it("answers the front tab's history and load, null under the unified inbox, moves only the front view, and tells of every load", async () => {
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
    window.emit(gmail, { kind: "navigated", url: `${GMAIL}/#sent` });

    expect(changes).toBe(3);
    expect(window.tabs.navigation()).toStrictEqual({
      canGoBack: true,
      canGoForward: false,
      loading: true,
    });

    window.tabs.goBack();
    window.tabs.goForward();
    window.tabs.stopFront();
    await window.profiles.selectTab({ profileId: "a", tabId: "c1" });
    window.tabs.goBack();

    expect(gmail?.moves).toStrictEqual(["back", "forward", "stop"]);
    expect(window.viewOf("persist:a", 1)?.moves).toStrictEqual(["back"]);

    window.setInboxOpen(true);

    expect(window.tabs.navigation()).toBeNull();
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

  it("tells when another tab comes to the front, and focuses only the front tab's view while it shows", async () => {
    const window = await setup();
    const calendar = { profileId: "a", tabId: "c1" };

    expect(window.fronts()).toBe(1);

    await window.profiles.selectTab(calendar);
    await window.profiles.select("b");
    await window.profiles.select("a");

    expect(window.fronts()).toBe(4);
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

  it("hides the front tab's view under the inbox without reloading it or taking it for failed, and shows it again", async () => {
    const window = await setup();
    const gmail = window.viewOf("persist:a");

    window.emit(gmail, { kind: "loaded" });
    window.setInboxOpen(true);

    expect([
      window.live(),
      window.tabs.status({ profileId: "a", tabId: "gmail" }),
      window.tabs.focuser(),
    ]).toStrictEqual([
      [["persist:a", GMAIL, false]],
      { kind: "live" },
      undefined,
    ]);

    window.setInboxOpen(false);

    expect([
      window.live(),
      gmail?.loaded.length,
      gmail?.reloads,
      typeof window.tabs.focuser(),
    ]).toStrictEqual([[["persist:a", GMAIL, true]], 1, 0, "function"]);
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
            ...(initial.profiles[0] as State["profiles"][number]),
            selectedTabId: "c1",
          },
        ],
      },
    });
    const link = `${GMAIL}/#inbox/abc`;

    window.viewOf("persist:a")?.options.onWindowOpen(link);
    await vi.advanceTimersByTimeAsync(0);

    expect(window.viewOf("persist:a", 1)?.loaded).toStrictEqual([link]);
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
    expect(window.live()).toStrictEqual([["persist:a", GMAIL, true]]);
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

    window.emit(gmail, { kind: "navigated", url: `${GMAIL}/#inbox` });
    window.emit(gmail, { kind: "titled", title: "Inbox" });
    window.emit(gmail, { kind: "navigated", url: `${GMAIL}/#sent` });
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

    window.emit(gmail, { kind: "loaded" });
    window.emit(gmail, REFUSED);

    expect(window.loads.map(({ key }) => key)).toStrictEqual([
      { profileId: "a", tabId: "gmail" },
    ]);
    await expect(window.loads[0]?.page.evaluate("1")).resolves.toBe(
      "persist:a"
    );
    expect(window.loads[0]?.page.url()).toBe(gmail?.loaded.at(-1));
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
