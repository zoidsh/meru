import { describe, expect, it } from "vitest";

import type { ShellState } from "#contract/shell.ts";
import { APPS } from "#core/apps.ts";
import type { FindBar } from "#core/find.ts";
import { recordInto } from "#core/log.fake.ts";
import type { Overlay } from "#core/overlay.ts";
import type { SidebarState } from "#core/sidebar.ts";
import { gmailTab, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { TabStatus } from "#core/tab-machine.ts";
import type { ContextMenuItem } from "#platform/context-menu.ts";

import {
  createShellHandlers,
  shellShortcuts,
  shellState,
} from "./shell-handlers.ts";

const two: State = {
  version: 1,
  profiles: [newProfile("a", "Default"), newProfile("b", "Work")],
  selectedProfileId: "a",
};

type Item = Exclude<ContextMenuItem, { type: "separator" }>;

const isItem = (item: ContextMenuItem): item is Item => !("type" in item);

const setup = ({
  state = two,
  overlay = undefined as Overlay | undefined,
  sidebar = "narrow" as SidebarState,
  pageSize = { width: 1000, height: 600 },
} = {}) => {
  let open = overlay;
  const overlays: (Overlay | "closed")[] = [];
  const calls: unknown[] = [];
  const menus: Item[][] = [];
  const menuPoints: unknown[] = [];
  const ran: string[] = [];
  const focused: unknown[] = [];
  const logged: string[] = [];

  const handlers = createShellHandlers({
    panes: {
      resize: (request) => {
        calls.push(["resize", request]);

        return Promise.resolve();
      },
      evenOut: (request) => {
        calls.push(["evenOut", request]);

        return Promise.resolve();
      },
    },
    profiles: {
      get: () => state,
      select: (profileId) => {
        calls.push(["selectProfile", profileId]);

        return Promise.resolve(true);
      },
      closeTab: (key) => {
        calls.push(["close", key]);

        return Promise.resolve(true);
      },
      maximizePane: (key, on) => {
        calls.push(["maximize", key, on]);

        return Promise.resolve(true);
      },
      moveTab: (key, before) => {
        calls.push(["move", key, before]);

        return Promise.resolve(true);
      },
      moveInBox: (key, before) => {
        calls.push(["moveInBox", key, before]);

        return Promise.resolve(true);
      },
      splitOntoTab: (key, target) => {
        calls.push(["splitOnto", key, target]);

        return Promise.resolve(true);
      },
      dropInView: (key, size, point) => {
        calls.push(["dropInView", key, size, point]);

        return Promise.resolve(true);
      },
    },
    pageSize: () => pageSize,
    overlays: {
      open: (next) => {
        open = next;
        overlays.push(next);
      },
      close: () => {
        open = undefined;
        overlays.push("closed");
      },
      current: () => open,
    },
    find: {
      type: (term, key) => {
        calls.push(["findInPage", term, ...(key ? [key.tabId] : [])]);
      },
      step: (forward, key) => {
        calls.push(["findStep", forward, ...(key ? [key.tabId] : [])]);
      },
      close: (key) => {
        calls.push(["findClose", ...(key ? [key.tabId] : [])]);
      },
    },
    updateCard: {
      run: (action) => {
        calls.push(["updateCard", action]);
      },
    },
    revealOwnWindow: (key) => {
      calls.push(["revealOwnWindow", key]);
    },
    navigateTab: (key, action) => {
      calls.push(["navigateTab", key, action]);

      return Promise.resolve();
    },
    tabs: {
      retry: (key) => {
        calls.push(["retry", key]);
      },
      select: (key) => {
        calls.push(["select", key]);

        return Promise.resolve();
      },
    },
    profileQuestion: {
      answer: (profileId) => {
        calls.push(["answerProfileQuestion", profileId]);
      },
    },
    sentCompose: {
      undo: () => {
        calls.push(["undoSent"]);
      },
    },
    screenPicker: {
      share: (source, window) => {
        calls.push(["shareScreen", source, window]);

        return Promise.resolve();
      },
      cancel: (window) => {
        calls.push(["cancelScreenPicker", window]);
      },
      retry: (window) => {
        calls.push(["retryScreenPicker", window]);
      },
      openSettings: () => {
        calls.push(["openScreenRecordingSettings"]);

        return Promise.resolve();
      },
    },
    downloads: {
      setOpen: (next) => {
        calls.push(["downloads", next]);
      },
      openFile: (id) => {
        calls.push(["openDownload", id]);

        return Promise.resolve();
      },
      showInFolder: (id) => {
        calls.push(["showDownload", id]);

        return Promise.resolve();
      },
      drag: (id) => {
        calls.push(["dragDownload", id]);
      },
      cancel: (id) => {
        calls.push(["cancelDownload", id]);
      },
      remove: (id) => {
        calls.push(["removeDownload", id]);

        return Promise.resolve();
      },
      clear: () => {
        calls.push(["clearDownloads"]);

        return Promise.resolve();
      },
    },
    inbox: {
      setOpen: (next) => {
        calls.push(["inbox", next]);
      },
      openMessage: (profileId, messageId) => {
        calls.push(["openMessage", profileId, messageId]);

        return Promise.resolve();
      },
      runAction: (profileId, messageId, action) => {
        calls.push(["action", profileId, messageId, action]);

        return Promise.resolve();
      },
    },
    openApp: {
      choose: (appId) => {
        calls.push(["openApp", appId]);

        return Promise.resolve();
      },
      chooseBookmark: (id) => {
        calls.push(["openBookmark", id]);

        return Promise.resolve();
      },
      removeBookmark: (id) => {
        calls.push(["removeBookmark", id]);

        return Promise.resolve();
      },
    },
    bookmarks: {
      toggle: (key, announce) => {
        calls.push(["toggleBookmark", key, announce]);

        return Promise.resolve();
      },
    },
    tabMenu: {
      open: (request) => {
        calls.push(["openTabMenu", request]);
      },
      openOwnWindow: (request) => {
        calls.push(["openOwnWindowMenu", request]);
      },
    },
    profileMenu: {
      open: (request) => {
        calls.push(["openProfileMenu", request]);
      },
    },
    openGmail: (profileId) => {
      calls.push(["openGmail", profileId]);

      return Promise.resolve();
    },
    window: {
      getContentAreaSize: () => ({ width: 1000, height: 700 }),
      showContextMenu: (items, at) => {
        menus.push(items.filter(isItem));
        menuPoints.push(at);
      },
    },
    trialFooter: () => false,
    sidebar: {
      current: () => sidebar,
      toggleWidth: () => {
        calls.push(["toggleWidth"]);
      },
    },
    focus: {
      focus: (preferences) => {
        focused.push(preferences);
      },
    },
    runCommand: (id) => {
      ran.push(id);
    },
    doNotDisturbItems: () => [
      { label: "For 5 Minutes", enabled: true, click: () => {} },
    ],
    log: recordInto(logged, { profiles: () => state.profiles }),
  });

  return {
    handlers,
    logged,
    overlays,
    calls,
    menus,
    menuPoints,
    ran,
    focused,
  };
};

describe(createShellHandlers, () => {
  it("closes the find bar through find, which ends its search", async () => {
    const shell = setup({
      overlay: { kind: "find", profileId: "a", tabId: "gmail" },
    });

    await shell.handlers.closeOverlay({});

    expect([shell.calls, shell.overlays]).toStrictEqual([[["findClose"]], []]);
  });

  it("puts the update card aside on a close, as Later or Close, rather than closing it to come straight back", async () => {
    const shell = setup({
      overlay: { kind: "update", card: "ready", version: "4.2.0" },
    });

    await shell.handlers.closeOverlay({});
    await shell.handlers.runUpdateCard({ action: "restart" });

    expect([shell.calls, shell.overlays]).toStrictEqual([
      [
        ["updateCard", "dismiss"],
        ["updateCard", "restart"],
      ],
      [],
    ]);
  });

  it("passes the find bar's term and steps to the search", async () => {
    const shell = setup();

    const away = { profileId: "a", tabId: "w" };

    await shell.handlers.findInPage({ term: "apple" });
    await shell.handlers.findStep({ forward: false });
    await shell.handlers.findInPage({ term: "pear", tab: away });
    await shell.handlers.findStep({ forward: true, tab: away });
    await shell.handlers.closeFind(away);

    expect(shell.calls).toStrictEqual([
      ["findInPage", "apple"],
      ["findStep", false],
      ["findInPage", "pear", "w"],
      ["findStep", true, "w"],
      ["findClose", "w"],
    ]);
  });

  it("gives focus to the front tab's page, or the shell with none left, when a close hides the sidebar, and only then", async () => {
    const shown = setup({ sidebar: "narrow" });
    const hidden = setup({ sidebar: "hidden" });
    const key = { profileId: "a", tabId: "t1" };

    await shown.handlers.closeTab(key);
    await hidden.handlers.closeTab(key);

    expect([shown.focused, hidden.focused]).toStrictEqual([
      [],
      [[{ kind: "front" }, { kind: "shell" }]],
    ]);
  });

  it("moves a tab of the selected profile, and refuses one of another", async () => {
    const shell = setup();

    await shell.handlers.moveTab({
      profileId: "a",
      tabId: "t1",
      before: "gmail",
    });
    await shell.handlers.moveTab({ profileId: "b", tabId: "gmail" });

    expect([shell.calls, shell.logged]).toStrictEqual([
      [["move", { profileId: "a", tabId: "t1" }, "gmail"]],
      [
        'tab-move-refused tab="profile 2 tab 1 gmail" reason=profile-not-selected',
      ],
    ]);
  });

  it("splits a tab dropped onto another where the panes fit, and otherwise opens the no-room toast", async () => {
    const tabs: State = {
      ...two,
      profiles: [
        {
          ...newProfile("a", "Default"),
          tabs: [
            gmailTab(),
            { id: "t1", app: "calendar", url: "https://c.test/", title: "" },
          ],
        },
      ],
    };
    const roomy = setup({ state: tabs });
    const cramped = setup({
      state: tabs,
      pageSize: { width: 487, height: 600 },
    });
    const key = { profileId: "a", tabId: "t1" };

    await roomy.handlers.splitOntoTab({ ...key, target: "gmail" });
    await cramped.handlers.splitOntoTab({ ...key, target: "gmail" });
    await roomy.handlers.moveInBox({ ...key, before: "gmail" });

    expect([
      roomy.calls,
      roomy.overlays,
      cramped.calls,
      cramped.overlays,
    ]).toStrictEqual([
      [
        ["splitOnto", key, "gmail"],
        ["moveInBox", key, "gmail"],
      ],
      [],
      [],
      [{ kind: "toast", message: "no-room" }],
    ]);
  });

  it("shows what a tab dragged over the pages would do, nothing where it does nothing, and drops it there, closing what it showed", async () => {
    const tabs: State = {
      ...two,
      profiles: [
        {
          ...newProfile("a", "Default"),
          tabs: [
            gmailTab(),
            { id: "t1", app: "calendar", url: "https://c.test/", title: "" },
          ],
        },
      ],
    };
    const shell = setup({ state: tabs });
    const key = { profileId: "a", tabId: "t1" };

    const right = {
      kind: "drop",
      zone: { x: 500, y: 0, width: 500, height: 600 },
      along: "pane",
      fits: true,
    };

    await shell.handlers.aimTab({ ...key, point: { x: 900, y: 300 } });
    await shell.handlers.aimTab({ ...key, point: { x: 100, y: 300 } });
    // Over Gmail's own page, which Gmail dragged does nothing on.
    await shell.handlers.aimTab({
      profileId: "a",
      tabId: "gmail",
      point: { x: 100, y: 300 },
    });
    await shell.handlers.aimTab({ ...key, point: { x: 900, y: 300 } });
    await shell.handlers.dropTab({ ...key, x: 900, y: 300 });
    await shell.handlers.aimTab({ ...key, point: null });
    await shell.handlers.dropTab({ profileId: "b", tabId: "t1", x: 1, y: 1 });
    // Further outside the page area than the window's inset.
    await shell.handlers.aimTab({ ...key, point: { x: -900, y: 300 } });
    await shell.handlers.aimTab({ ...key, point: { x: 900, y: 620 } });
    await shell.handlers.dropTab({ ...key, x: -900, y: 300 });

    expect([shell.overlays, shell.calls, shell.logged]).toStrictEqual([
      [
        right,
        { ...right, zone: { x: 0, y: 0, width: 500, height: 600 } },
        "closed",
        right,
        "closed",
      ],
      [["dropInView", key, { width: 1000, height: 600 }, { x: 900, y: 300 }]],
      [
        'tab-drop-refused tab="a removed profile a closed tab" reason=profile-not-selected',
        'tab-drop-refused tab="profile 1 tab 2 calendar" reason=outside-pages',
      ],
    ]);
  });

  it("hands each tab control's call to the tabs", async () => {
    const shell = setup();
    const key = { profileId: "a", tabId: "t1" };

    await shell.handlers.selectTab(key);
    await shell.handlers.closeTab(key);
    await shell.handlers.retryTab(key);

    expect(shell.calls).toStrictEqual([
      ["select", key],
      ["inbox", false],
      ["close", key],
      ["retry", key],
    ]);
  });

  it("closes the unified inbox after selecting a profile", async () => {
    const shell = setup();

    await shell.handlers.selectProfile({ profileId: "a" });

    expect(shell.calls).toStrictEqual([
      ["selectProfile", "a"],
      ["inbox", false],
    ]);
  });
});

const CLOSED_INBOX = { open: false, profiles: [], rows: [], notice: null };

const CHROME = {
  language: "en",
  pro: {
    trialChoice: false,
    firstProfile: null,
    trialFooterDays: null,
    licenseRequest: false,
    standing: {
      status: "licensed",
      unconfirmedReason: null,
      trialDaysLeft: null,
      downgradePending: false,
      hasLicenseKey: true,
    },
  } as ShellState["pro"],
  sidebar: { state: "hidden", showWindows: true },
  appearance: {
    tint: true,
    buttons: {
      sidebar: true,
      newTab: true,
      unifiedInbox: true,
      downloads: true,
      doNotDisturb: true,
    },
  },
  shortcuts: {},
  ariaShortcuts: {},
  navigation: null,
  windows: [] as ShellState["windows"],
  downloads: {
    open: false,
    window: null,
    button: { kind: "plain" },
    rows: [],
  } as ShellState["downloads"],
  screenPicker: null,
} as const;

const NO_MAIL = { status: "unknown", unreadCount: null } as const;

/** The shell's own keys, which every platform's shortcuts carry. */
const keys = (platform: "darwin" | "win32") =>
  Object.fromEntries(
    Object.entries(shellShortcuts([], platform)).filter(([id]) =>
      id.startsWith("key:")
    )
  );

describe(shellShortcuts, () => {
  it("gives each command's shortcut on the platform as a person reads it, and leaves out one with none there", () => {
    const commands = [
      { id: "a", shortcut: { darwin: "CmdOrCtrl+S", win32: "CmdOrCtrl+S" } },
      { id: "b", shortcut: { darwin: "Command+Shift+]" } },
      { id: "c" },
    ];

    expect(shellShortcuts(commands, "darwin")).toStrictEqual({
      a: "⌘S",
      b: "⇧⌘]",
      ...keys("darwin"),
    });
    expect(shellShortcuts(commands, "win32")).toStrictEqual({
      a: "Ctrl+S",
      ...keys("win32"),
    });
  });

  it("gives the shell's own keys, which are no command's, the same way", () => {
    expect([
      shellShortcuts([], "darwin"),
      shellShortcuts([], "linux"),
      shellShortcuts([], "linux", true),
    ]).toStrictEqual([
      { "key:Enter": "↩", "key:Shift+Enter": "⇧↩", "key:Escape": "⎋" },
      {
        "key:Enter": "Enter",
        "key:Shift+Enter": "Shift+Enter",
        "key:Escape": "Escape",
      },
      {
        "key:Enter": "Enter",
        "key:Shift+Enter": "Shift+Enter",
        "key:Escape": "Escape",
      },
    ]);
  });
});

/** The overlay the shell is given with Gmail's find bar open and `find` the bar. */
const overlayWith = (find?: FindBar) =>
  shellState(
    two,
    () => ({ kind: "live" }),
    { selectedAsleep: false, panes: null, handles: [], find },
    { kind: "find", profileId: "a", tabId: "gmail" },
    () => NO_MAIL,
    undefined,
    CLOSED_INBOX,
    CHROME,
    APPS
  ).overlay;

describe("the find bar as the shell is given it", () => {
  const bar: FindBar = {
    key: { profileId: "a", tabId: "gmail" },
    open: true,
    term: "apple",
    ordinal: 2,
    matches: 5,
    requestId: 4,
    awaitingLoad: false,
    opened: 3,
  };

  it("shows the bar over its tab's page with its term and count", () => {
    expect(overlayWith(bar)).toStrictEqual({
      kind: "find",
      profileId: "a",
      tabId: "gmail",
      term: "apple",
      ordinal: 2,
      matches: 5,
      opened: 3,
    });
  });

  it("shows nothing for a bar over another tab's page, or none", () => {
    expect([
      overlayWith({ ...bar, key: { profileId: "a", tabId: "c1" } }),
      overlayWith(),
    ]).toStrictEqual([{ kind: "none" }, { kind: "none" }]);
  });
});

/** The boxes the shell is given with `c1` and pinned `d1` split, or none. */
const boxOf = (selectedTabId: string, split = true) =>
  shellState(
    {
      ...two,
      profiles: [
        {
          ...newProfile("a", "Default"),
          tabs: [
            gmailTab(),
            { id: "c1", app: "calendar", url: "", title: "" },
            { id: "d1", app: "drive", url: "", title: "", pinned: true },
          ],
          selectedTabId,
          ...(split && {
            splits: [
              {
                root: {
                  direction: "row",
                  children: [
                    { size: 0.5, pane: "c1" },
                    { size: 0.5, pane: "d1" },
                  ],
                },
              },
            ],
          }),
        },
        newProfile("b", "Work"),
      ],
    },
    () => ({ kind: "live" }),
    { selectedAsleep: false, panes: null, handles: [] },
    undefined,
    () => NO_MAIL,
    undefined,
    CLOSED_INBOX,
    CHROME,
    APPS
  ).tabs.boxes;

describe(shellState, () => {
  it("gives the shell the profiles with names to show, their colours by place, their mail and whether each sleeps, and nothing else of them", () => {
    expect(
      shellState(
        {
          ...two,
          profiles: [
            { ...newProfile("a", "Default"), color: "teal" },
            { ...newProfile("b", "Work"), asleep: true },
          ],
        },
        () => ({ kind: "live" }),
        { selectedAsleep: false, panes: null, handles: [] },
        undefined,
        (profileId) =>
          profileId === "a" ? { status: "ok", unreadCount: 4 } : NO_MAIL,
        undefined,
        CLOSED_INBOX,
        CHROME,
        APPS
      ).profiles
    ).toStrictEqual({
      profiles: [
        {
          id: "a",
          name: "Default",
          color: "#2d52d2",
          mail: { status: "ok", unreadCount: 4 },
          asleep: false,
        },
        {
          id: "b",
          name: "Work",
          color: "#ff6227",
          mail: NO_MAIL,
          asleep: true,
        },
      ],
      selectedProfileId: "a",
    });
  });

  it("gives the shell the selected profile's shown tabs, which it may close, and how each is", () => {
    const statuses: Record<string, TabStatus> = {
      "a/c1": {
        kind: "failed",
        reason: { code: -106, name: "ERR_INTERNET_DISCONNECTED" },
        attempt: 2,
        retrying: false,
      },
      "a/d1": { kind: "crashed", reason: "oom" },
    };

    expect(
      shellState(
        {
          ...two,
          profiles: [
            {
              ...newProfile("a", "Default"),
              tabs: [
                { ...gmailTab(), title: "Inbox" },
                { id: "c1", app: "calendar", url: "", title: "Week" },
                { id: "t9", app: "tasks", url: "", title: "Later" },
                { id: "d1", app: "drive", url: "", title: "" },
              ],
              selectedTabId: "c1",
            },
            newProfile("b", "Work"),
          ],
        },
        ({ profileId, tabId }) =>
          statuses[`${profileId}/${tabId}`] ?? { kind: "unloaded" },
        {
          selectedAsleep: true,
          panes: null,
          handles: [],
          bookmarked: ({ tabId }) => (tabId === "c1" ? true : undefined),
        },
        undefined,
        () => NO_MAIL,
        undefined,
        CLOSED_INBOX,
        CHROME,
        APPS
      ).tabs
    ).toStrictEqual({
      profileId: "a",
      selectedTabId: "c1",
      selectedAsleep: true,
      tabs: [
        {
          id: "gmail",
          app: "gmail",
          title: "Inbox",
          pinned: true,
          ownWindow: false,
          status: { kind: "unloaded" },
          bookmarked: null,
        },
        {
          id: "c1",
          app: "calendar",
          title: "Week",
          pinned: false,
          ownWindow: false,
          status: {
            kind: "failed",
            reason: "ERR_INTERNET_DISCONNECTED",
            retrying: false,
          },
          bookmarked: true,
        },
        {
          id: "d1",
          app: "drive",
          title: "",
          pinned: false,
          ownWindow: false,
          status: { kind: "crashed" },
          bookmarked: null,
        },
      ],
      panes: null,
      handles: [],
      boxes: [],
    });
  });

  it("gives the shell the split's box in its order whichever tab is selected, and none without a split", () => {
    const box = [{ tabs: ["d1", "c1"], maximized: false }];

    expect([boxOf("c1"), boxOf("gmail"), boxOf("c1", false)]).toStrictEqual([
      box,
      box,
      [],
    ]);
  });
});

const overlaySlice = (open: Overlay | undefined) =>
  shellState(
    two,
    () => ({ kind: "live" }),
    { selectedAsleep: false, panes: null, handles: [] },
    open,
    () => NO_MAIL,
    undefined,
    CLOSED_INBOX,
    CHROME,
    APPS
  ).overlay;

describe("the overlay slice", () => {
  it("is none while nothing is open", () => {
    expect(overlaySlice(undefined)).toStrictEqual({ kind: "none" });
  });

  it("lists New tab's profile's bookmarks beside its apps, and names the page a bookmark toast tells of", () => {
    const row = {
      id: "b1",
      title: "Week",
      app: "calendar" as const,
      appName: "Calendar",
    };
    const slice = (open: Overlay) =>
      shellState(
        two,
        () => ({ kind: "live" }),
        {
          selectedAsleep: false,
          panes: null,
          handles: [],
          bookmarks: (profileId) => (profileId === "b" ? [row] : []),
        },
        open,
        () => NO_MAIL,
        undefined,
        CLOSED_INBOX,
        CHROME,
        APPS
      ).overlay;

    expect([
      slice({ kind: "open-app", profileId: "b" }),
      slice({ kind: "open-app", profileId: "gone" }),
      slice({ kind: "toast", message: "bookmarked", title: "Week" }),
      slice({ kind: "toast", message: "bookmark-removed" }),
    ]).toStrictEqual([
      expect.objectContaining({ kind: "open-app", bookmarks: [row] }),
      { kind: "none" },
      { kind: "toast", message: "bookmarked", title: "Week" },
      { kind: "toast", message: "bookmark-removed", title: null },
    ]);
  });

  it("lists what New tab's profile can open, by id and name, and its bookmarks", () => {
    expect(overlaySlice({ kind: "open-app", profileId: "a" })).toStrictEqual({
      kind: "open-app",
      profileId: "a",
      apps: APPS.filter(({ id }) => id !== "gmail").map(({ id, name }) => ({
        id,
        name,
      })),
      bookmarks: [],
      split: null,
    });
  });

  it("lists, for Open in split, every app but Gmail where its tab is the one the pane goes beside", () => {
    expect(
      overlaySlice({ kind: "open-app", profileId: "b", split: "row" })
    ).toMatchObject({
      apps: APPS.filter(({ id }) => id !== "gmail").map(({ id, name }) => ({
        id,
        name,
      })),
      split: "row",
    });
  });

  it("is none for a profile that is gone", () => {
    expect(overlaySlice({ kind: "open-app", profileId: "gone" })).toStrictEqual(
      { kind: "none" }
    );
  });
});

const doNotDisturbSlice = (doNotDisturb: State["doNotDisturb"]) =>
  shellState(
    two,
    () => ({ kind: "live" }),
    { selectedAsleep: false, panes: null, handles: [] },
    undefined,
    () => NO_MAIL,
    doNotDisturb,
    CLOSED_INBOX,
    CHROME,
    APPS
  ).doNotDisturb;

describe("New tab in the shell", () => {
  it("toggles through the registry's command and hands a choice to New tab", async () => {
    const shell = setup();

    await shell.handlers.toggleOpenApp({});
    await shell.handlers.openApp({ appId: "drive" });

    expect([shell.ran, shell.calls]).toStrictEqual([
      ["app.open"],
      [["openApp", "drive"]],
    ]);
  });

  it("hands Bookmarks' rows to the bookmarks, and a row's bookmark button too, announced only in the main window", async () => {
    const shell = setup({
      state: {
        ...two,
        profiles: [
          {
            ...newProfile("a", "Default"),
            tabs: [
              gmailTab(),
              { id: "c1", app: "calendar", url: "", title: "" },
              { id: "d1", app: "docs", url: "", title: "", ownWindow: true },
            ],
          },
          newProfile("b", "Work"),
        ],
      },
    });

    await shell.handlers.openBookmark({ id: "b1" });
    await shell.handlers.removeBookmark({ id: "b2" });
    await shell.handlers.toggleTabBookmark({ profileId: "a", tabId: "c1" });
    await shell.handlers.toggleTabBookmark({ profileId: "a", tabId: "d1" });
    await shell.handlers.toggleTabBookmark({ profileId: "a", tabId: "gone" });

    expect([shell.ran, shell.calls, shell.logged]).toStrictEqual([
      [],
      [
        ["openBookmark", "b1"],
        ["removeBookmark", "b2"],
        ["toggleBookmark", { profileId: "a", tabId: "c1" }, true],
        ["toggleBookmark", { profileId: "a", tabId: "d1" }, false],
      ],
      ['bookmark-refused tab="profile 1 a closed tab" reason=tab-gone'],
    ]);
  });

  it("hands a tab's menu and More options their tab and point", async () => {
    const shell = setup();
    const request = { profileId: "a", tabId: "gmail", x: 4, y: 50 };

    await shell.handlers.openTabMenu(request);
    await shell.handlers.openOwnWindowMenu({ ...request, x: 700 });

    expect(shell.calls).toStrictEqual([
      ["openTabMenu", request],
      ["openOwnWindowMenu", { ...request, x: 700 }],
    ]);
  });

  it("hands a profile menu's point to the profile menu", async () => {
    const shell = setup();
    const request = { profileId: "b", x: 120, y: 20 };

    await shell.handlers.openProfileMenu(request);

    expect(shell.calls).toStrictEqual([["openProfileMenu", request]]);
  });

  it("hands Sign in's profile to what opens its Gmail", async () => {
    const shell = setup();

    await shell.handlers.openGmail({ profileId: "b" });

    expect(shell.calls).toStrictEqual([["openGmail", "b"]]);
  });
});

describe("the sidebar's toggles", () => {
  it("show or hide it through the registry's command, and narrow or widen it", async () => {
    const shell = setup();

    await shell.handlers.toggleSidebar({});
    await shell.handlers.toggleSidebarWidth({});

    expect([shell.ran, shell.calls]).toStrictEqual([
      ["sidebar.toggle"],
      [["toggleWidth"]],
    ]);
  });
});

describe("Do Not Disturb in the shell", () => {
  it("toggles through the registry's command and pops up the shared menu at the point asked for, refusing one outside the content area", async () => {
    const shell = setup();

    await shell.handlers.toggleDoNotDisturb({});
    await shell.handlers.openDoNotDisturbMenu({ x: 900, y: 20 });
    await shell.handlers.openDoNotDisturbMenu({ x: 1200, y: 20 });

    expect([
      shell.ran,
      shell.menus.map((items) => items.map(({ label }) => label)),
      shell.menuPoints,
      shell.logged,
    ]).toStrictEqual([
      ["doNotDisturb.toggle"],
      [["For 5 Minutes"]],
      [{ x: 900, y: 20 }],
      ["do-not-disturb-menu-refused x=1200 y=20"],
    ]);
  });

  it("tells the shell whether it holds, and until when", () => {
    expect([
      doNotDisturbSlice(undefined),
      doNotDisturbSlice({ until: null }),
      doNotDisturbSlice({ until: 5000 }),
    ]).toStrictEqual([
      { on: false, until: null },
      { on: true, until: null },
      { on: true, until: 5000 },
    ]);
  });
});
