import { describe, expect, it } from "vitest";

import { APPS } from "#core/apps.ts";
import type { Overlay } from "#core/overlay.ts";
import type { SidebarState } from "#core/sidebar.ts";
import { gmailTab, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { TabStatus } from "#core/tab-machine.ts";
import type { ContextMenuItem } from "#platform/window.ts";

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
} = {}) => {
  const renamed: [string, string][] = [];
  let open = overlay;
  const overlays: (Overlay | "closed")[] = [];
  const calls: unknown[] = [];
  const menus: Item[][] = [];
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
      rename: (profileId, name) => {
        renamed.push([profileId, name]);

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
    },
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
    tabs: {
      retry: (key) => {
        calls.push(["retry", key]);
      },
      select: (key) => {
        calls.push(["select", key]);

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
    },
    tabMenu: {
      open: (request) => {
        calls.push(["openTabMenu", request]);
      },
      run: (item) => {
        calls.push(["runTabMenuItem", item]);

        return Promise.resolve();
      },
    },
    profileMenu: {
      open: (request) => {
        calls.push(["openProfileMenu", request]);
      },
      run: (item) => {
        calls.push(["runProfileMenuItem", item]);

        return Promise.resolve();
      },
    },
    openGmail: (profileId) => {
      calls.push(["openGmail", profileId]);

      return Promise.resolve();
    },
    window: {
      showContextMenu: (items) => menus.push(items.filter(isItem)),
    },
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
    log: (message) => {
      logged.push(message);
    },
  });

  return {
    handlers,
    logged,
    renamed,
    overlays,
    calls,
    menus,
    ran,
    focused,
  };
};

describe(createShellHandlers, () => {
  it("renames the profile whose rename is open and closes it", async () => {
    const shell = setup({
      overlay: { kind: "rename-profile", profileId: "b" },
    });

    await shell.handlers.renameProfile({ profileId: "b", name: " Home " });

    expect(shell.renamed).toStrictEqual([["b", " Home "]]);
    expect(shell.overlays).toStrictEqual(["closed"]);
  });

  it("keeps the first profile's stored name when its shown name is left as it was", async () => {
    const shell = setup({
      overlay: { kind: "rename-profile", profileId: "a" },
    });

    await shell.handlers.renameProfile({ profileId: "a", name: "Default " });

    expect(shell.renamed).toStrictEqual([]);
    expect(shell.overlays).toStrictEqual(["closed"]);
  });

  it("refuses to rename a profile whose rename is not open", async () => {
    const shell = setup({
      overlay: { kind: "rename-profile", profileId: "a" },
    });

    await shell.handlers.renameProfile({ profileId: "b", name: "Home" });

    expect(shell.renamed).toStrictEqual([]);
    expect(shell.overlays).toStrictEqual([]);

    await shell.handlers.closeOverlay({});

    expect(shell.overlays).toStrictEqual(["closed"]);
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
      ["Refused to move tab b/gmail of a profile not selected"],
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
  sidebar: { state: "hidden" },
  shortcuts: {},
  ariaShortcuts: {},
  navigation: null,
} as const;

const NO_MAIL = { status: "unknown", unreadCount: null } as const;

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
    });
    expect(shellShortcuts(commands, "win32")).toStrictEqual({ a: "Ctrl+S" });
  });
});

/** The box the shell is given with `c1` and pinned `d1` split, or nothing. */
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
            split: {
              root: {
                direction: "row",
                children: [
                  { size: 0.5, pane: "c1" },
                  { size: 0.5, pane: "d1" },
                ],
              },
            },
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
  ).tabs.box;

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
        { selectedAsleep: true, panes: null, handles: [] },
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
          status: { kind: "unloaded" },
        },
        {
          id: "c1",
          app: "calendar",
          title: "Week",
          pinned: false,
          status: {
            kind: "failed",
            reason: "ERR_INTERNET_DISCONNECTED",
            retrying: false,
          },
        },
        {
          id: "d1",
          app: "drive",
          title: "",
          pinned: false,
          status: { kind: "crashed" },
        },
      ],
      panes: null,
      handles: [],
      box: null,
      maximized: false,
    });
  });

  it("gives the shell the split's box in its order whichever tab is selected, and none without a split", () => {
    expect([boxOf("c1"), boxOf("gmail"), boxOf("c1", false)]).toStrictEqual([
      ["d1", "c1"],
      ["d1", "c1"],
      null,
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

  it("names the profile being renamed as shown, Default translated", () => {
    expect(
      overlaySlice({ kind: "rename-profile", profileId: "a" })
    ).toStrictEqual({
      kind: "rename-profile",
      profileId: "a",
      name: "Default",
    });
    expect(
      overlaySlice({ kind: "rename-profile", profileId: "b" })
    ).toStrictEqual({ kind: "rename-profile", profileId: "b", name: "Work" });
  });

  it("lists what Open app's profile can open, by id and name", () => {
    expect(overlaySlice({ kind: "open-app", profileId: "a" })).toStrictEqual({
      kind: "open-app",
      profileId: "a",
      apps: APPS.filter(({ id }) => id !== "gmail").map(({ id, name }) => ({
        id,
        name,
      })),
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

  it("gives a tab's menu its point, the tab's title or else its app's name, and what it offers", () => {
    expect(
      overlaySlice({
        kind: "tab-menu",
        profileId: "a",
        tabId: "gmail",
        x: 10,
        y: 60,
      })
    ).toStrictEqual({
      kind: "tab-menu",
      profileId: "a",
      tabId: "gmail",
      x: 10,
      y: 60,
      title: "Gmail",
      pinned: true,
      items: [
        { id: "sleep", enabled: true },
        { id: "reload", enabled: true },
        { id: "duplicate", enabled: false },
        { id: "copyUrl", enabled: true },
        { id: "openInBrowser", enabled: true },
        { id: "pin", enabled: true },
        { id: "openAtLaunch", enabled: true, checked: true },
        { id: "splitRight", enabled: true },
        { id: "splitDown", enabled: true },
        { id: "maximize", enabled: false },
        { id: "separate", enabled: false },
        { id: "closeOthers", enabled: false },
        { id: "closeBelow", enabled: false },
      ],
    });
    expect(
      overlaySlice({
        kind: "tab-menu",
        profileId: "a",
        tabId: "gone",
        x: 10,
        y: 60,
      })
    ).toStrictEqual({ kind: "none" });
  });

  it("gives a profile's menu its point, the profile's name, and Sleep", () => {
    expect(
      overlaySlice({ kind: "profile-menu", profileId: "b", x: 120, y: 20 })
    ).toStrictEqual({
      kind: "profile-menu",
      profileId: "b",
      x: 120,
      y: 20,
      title: "Work",
      items: [{ id: "sleep", enabled: true }],
    });
  });

  it("is none for a profile that is gone", () => {
    expect([
      overlaySlice({ kind: "rename-profile", profileId: "gone" }),
      overlaySlice({ kind: "profile-menu", profileId: "gone", x: 1, y: 1 }),
    ]).toStrictEqual([{ kind: "none" }, { kind: "none" }]);
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

describe("Open app in the shell", () => {
  it("toggles through the registry's command and hands a choice to Open app", async () => {
    const shell = setup();

    await shell.handlers.toggleOpenApp({});
    await shell.handlers.openApp({ appId: "drive" });

    expect([shell.ran, shell.calls]).toStrictEqual([
      ["app.open"],
      [["openApp", "drive"]],
    ]);
  });

  it("hands a tab menu's point and its item to the tab menu", async () => {
    const shell = setup();
    const request = { profileId: "a", tabId: "gmail", x: 4, y: 50 };

    await shell.handlers.openTabMenu(request);
    await shell.handlers.runTabMenuItem({ item: "pin" });

    expect(shell.calls).toStrictEqual([
      ["openTabMenu", request],
      ["runTabMenuItem", "pin"],
    ]);
  });

  it("hands a profile menu's point and its item to the profile menu", async () => {
    const shell = setup();
    const request = { profileId: "b", x: 120, y: 20 };

    await shell.handlers.openProfileMenu(request);
    await shell.handlers.runProfileMenuItem({ item: "sleep" });

    expect(shell.calls).toStrictEqual([
      ["openProfileMenu", request],
      ["runProfileMenuItem", "sleep"],
    ]);
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
  it("toggles through the registry's command and pops up the shared menu", async () => {
    const shell = setup();

    await shell.handlers.toggleDoNotDisturb({});
    await shell.handlers.openDoNotDisturbMenu({});

    expect(shell.ran).toStrictEqual(["doNotDisturb.toggle"]);
    expect(
      shell.menus.map((items) => items.map(({ label }) => label))
    ).toStrictEqual([["For 5 Minutes"]]);
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
