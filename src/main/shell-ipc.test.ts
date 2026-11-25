import { describe, expect, it } from "vitest";

import { SHELL_CHANNELS } from "#contract/shell.ts";
import type { ShellState } from "#contract/shell.ts";
import type { Ipc, IpcSender } from "#platform/ipc.ts";

import { RefusedCallError } from "./contract-ipc.ts";
import { createSenderRegistry } from "./senders.ts";
import { createShellSource, serveShellContract } from "./shell-ipc.ts";
import type { ShellHandlers } from "./shell-ipc.ts";

const SHELL = 1;
const OTHER_SHELL = 2;
const CONTENT_VIEW = 3;
const OVERLAY = 4;
const UNKNOWN = 99;

const SHELL_ORIGIN = "meru-app://shell";

/** A webContents id stands for its main frame on the shell's origin. */
const asSender = (sender: number | IpcSender): IpcSender =>
  typeof sender === "number"
    ? { webContentsId: sender, isMainFrame: true, origin: SHELL_ORIGIN }
    : sender;

const TABS: ShellState["tabs"] = {
  profileId: "a",
  selectedTabId: "gmail",
  selectedAsleep: false,
  panes: null,
  handles: [],
  boxes: [],
  tabs: [
    {
      id: "gmail",
      app: "gmail",
      title: "",
      pinned: true,
      ownWindow: false,
      status: { kind: "live" },
      bookmarked: null,
    },
  ],
};

const NO_MAIL = { status: "unknown", unreadCount: null } as const;

const profilesSlice = (selectedProfileId: string) => ({
  profiles: [
    {
      id: "a",
      name: "Default",
      color: "#2d52d2",
      mail: NO_MAIL,
      asleep: false,
    },
    {
      id: "b",
      name: "Profile 2",
      color: "#ff6227",
      mail: NO_MAIL,
      asleep: false,
    },
  ],
  selectedProfileId,
});

const setup = () => {
  const handled = new Map<
    string,
    (sender: IpcSender, payload: unknown) => Promise<unknown>
  >();
  const listened = new Map<
    string,
    (sender: IpcSender, payload: unknown) => void
  >();
  const sent: { to: number; channel: string; message: unknown }[] = [];
  const calls: unknown[] = [];
  const logs: string[] = [];
  const changeListeners: (() => void)[] = [];
  let state: ShellState = {
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
    },
    profiles: profilesSlice("a"),
    tabs: TABS,
    sidebar: { state: "hidden" },
    appearance: {
      tint: true,
      buttons: {
        newTab: true,
        unifiedInbox: true,
        downloads: true,
        doNotDisturb: true,
      },
    },
    shortcuts: {},
    ariaShortcuts: {},
    navigation: null,
    windows: [],
    doNotDisturb: { on: false, until: null },
    overlay: { kind: "none" },
    inbox: { open: false, profiles: [], rows: [], notice: null },
    downloads: {
      open: false,
      window: null,
      button: { kind: "plain" },
      rows: [],
    },
  };

  const ipc: Ipc = {
    handle: (channel, handler) => {
      handled.set(channel, handler);
    },
    on: (channel, listener) => {
      listened.set(channel, listener);
    },
    send: (to, channel, message) => {
      sent.push({ to, channel, message });

      return true;
    },
  };

  const senders = createSenderRegistry();

  senders.register(SHELL, { role: "shell" });
  senders.register(OTHER_SHELL, { role: "shell" });
  senders.register(CONTENT_VIEW, {
    role: "content-view",
    profileId: "a",
    tabId: "gmail",
  });
  senders.register(OVERLAY, { role: "overlay" });

  const handlers: ShellHandlers = {
    activateLicense: (request) => {
      calls.push(["activateLicense", request]);

      return Promise.resolve({ ok: true } as const);
    },
    retryEntitlement: () => Promise.resolve(),
    continueFree: () => Promise.resolve({ ok: true } as const),
    openMeruPro: () => Promise.resolve(),
    navigateTab: (request) => {
      calls.push(["navigateTab", request]);

      return Promise.resolve();
    },
    findInPage: (request) => {
      calls.push(["findInPage", request]);

      return Promise.resolve();
    },
    findStep: (request) => {
      calls.push(["findStep", request]);

      return Promise.resolve();
    },
    closeFind: (request) => {
      calls.push(["closeFind", request]);

      return Promise.resolve();
    },
    resizePanes: (request) => {
      calls.push(["resizePanes", request]);

      return Promise.resolve();
    },
    maximizePane: (request) => {
      calls.push(["maximizePane", request]);

      return Promise.resolve();
    },
    evenOutPanes: (request) => {
      calls.push(["evenOutPanes", request]);

      return Promise.resolve();
    },
    selectProfile: (request) => {
      calls.push(["selectProfile", request]);

      return Promise.resolve();
    },
    navigate: (request) => {
      calls.push(["navigate", request]);

      return Promise.resolve();
    },
    selectTab: (request) => {
      calls.push(["selectTab", request]);

      return Promise.resolve();
    },
    closeTab: (request) => {
      calls.push(["closeTab", request]);

      return Promise.resolve();
    },
    moveTab: (request) => {
      calls.push(["moveTab", request]);

      return Promise.resolve();
    },
    moveInBox: (request) => {
      calls.push(["moveInBox", request]);

      return Promise.resolve();
    },
    splitOntoTab: (request) => {
      calls.push(["splitOntoTab", request]);

      return Promise.resolve();
    },
    aimTab: (request) => {
      calls.push(["aimTab", request]);

      return Promise.resolve();
    },
    dropTab: (request) => {
      calls.push(["dropTab", request]);

      return Promise.resolve();
    },
    retryTab: (request) => {
      calls.push(["retryTab", request]);

      return Promise.resolve();
    },
    closeOverlay: (request) => {
      calls.push(["closeOverlay", request]);

      return Promise.resolve();
    },
    toggleSidebar: (request) => {
      calls.push(["toggleSidebar", request]);

      return Promise.resolve();
    },
    toggleSidebarWidth: (request) => {
      calls.push(["toggleSidebarWidth", request]);

      return Promise.resolve();
    },
    toggleDoNotDisturb: (request) => {
      calls.push(["toggleDoNotDisturb", request]);

      return Promise.resolve();
    },
    openDoNotDisturbMenu: (request) => {
      calls.push(["openDoNotDisturbMenu", request]);

      return Promise.resolve();
    },
    setInboxOpen: (request) => {
      calls.push(["setInboxOpen", request]);

      return Promise.resolve();
    },
    openInboxMessage: (request) => {
      calls.push(["openInboxMessage", request]);

      return Promise.resolve();
    },
    setDownloadsOpen: (request) => {
      calls.push(["setDownloadsOpen", request]);

      return Promise.resolve();
    },
    openDownload: (request) => {
      calls.push(["openDownload", request]);

      return Promise.resolve();
    },
    showDownload: (request) => {
      calls.push(["showDownload", request]);

      return Promise.resolve();
    },
    dragDownload: (request) => {
      calls.push(["dragDownload", request]);

      return Promise.resolve();
    },
    cancelDownload: (request) => {
      calls.push(["cancelDownload", request]);

      return Promise.resolve();
    },
    removeDownload: (request) => {
      calls.push(["removeDownload", request]);

      return Promise.resolve();
    },
    clearDownloads: (request) => {
      calls.push(["clearDownloads", request]);

      return Promise.resolve();
    },
    runInboxAction: (request) => {
      calls.push(["runInboxAction", request]);

      return Promise.resolve();
    },
    toggleOpenApp: (request) => {
      calls.push(["toggleOpenApp", request]);

      return Promise.resolve();
    },
    openBookmark: (request) => {
      calls.push(["openBookmark", request]);

      return Promise.resolve();
    },
    removeBookmark: (request) => {
      calls.push(["removeBookmark", request]);

      return Promise.resolve();
    },
    toggleTabBookmark: (request) => {
      calls.push(["toggleTabBookmark", request]);

      return Promise.resolve();
    },
    openApp: (request) => {
      calls.push(["openApp", request]);

      return Promise.resolve();
    },
    openGmail: (request) => {
      calls.push(["openGmail", request]);

      return Promise.resolve();
    },
    openTabMenu: (request) => {
      calls.push(["openTabMenu", request]);

      return Promise.resolve();
    },
    openOwnWindowMenu: (request) => {
      calls.push(["openOwnWindowMenu", request]);

      return Promise.resolve();
    },
    openProfileMenu: (request) => {
      calls.push(["openProfileMenu", request]);

      return Promise.resolve();
    },
  };

  serveShellContract({
    ipc,
    senders,
    handlers,
    state: {
      read: () => state,
      onChange: (listener) => {
        changeListeners.push(listener);
      },
    },
    shellOrigin: SHELL_ORIGIN,
    log: (message) => logs.push(message),
  });

  const call = (sender: number | IpcSender, name: string, payload: unknown) => {
    const handler = handled.get(SHELL_CHANNELS.call(name as "toggleSidebar"));

    if (!handler) {
      throw new Error(`No handler for ${name}`);
    }

    return handler(asSender(sender), payload);
  };

  return {
    call,
    calls,
    logs,
    senders,
    handshake: (sender: number | IpcSender, payload: unknown = ["profiles"]) =>
      listened.get(SHELL_CHANNELS.sync)?.(asSender(sender), payload),
    change: (next: Partial<ShellState>) => {
      state = { ...state, ...next };

      for (const listener of changeListeners) {
        listener();
      }
    },
    sentTo: (senderId: number) =>
      sent
        .filter(
          ({ to, channel }) =>
            to === senderId && channel === SHELL_CHANNELS.state
        )
        .map(({ message }) => message),
  };
};

describe(serveShellContract, () => {
  it("passes a valid call from the shell to its handler", async () => {
    const shell = setup();

    await shell.call(SHELL, "selectProfile", { profileId: "b" });
    await shell.call(SHELL, "toggleSidebar", {});

    expect(shell.calls).toStrictEqual([
      ["selectProfile", { profileId: "b" }],
      ["toggleSidebar", {}],
    ]);
  });

  it("refuses a malformed call", async () => {
    const shell = setup();

    const results = await Promise.allSettled(
      [undefined, {}, { profileId: 7 }, { profileId: "" }].map((payload) =>
        shell.call(SHELL, "selectProfile", payload)
      )
    );

    expect(
      results.map(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof RefusedCallError
      )
    ).toStrictEqual([true, true, true, true]);
    expect(shell.calls).toStrictEqual([]);
  });

  it("passes the inbox's calls with a listed shape and refuses every other", async () => {
    const shell = setup();
    const refused = async (name: string, payload: unknown) => {
      try {
        await shell.call(SHELL, name, payload);

        return false;
      } catch (error) {
        return error instanceof RefusedCallError;
      }
    };

    await shell.call(SHELL, "setInboxOpen", { open: true });
    await shell.call(SHELL, "openInboxMessage", {
      profileId: "a",
      messageId: "18c2f0a9",
    });
    await shell.call(SHELL, "runInboxAction", {
      profileId: "a",
      messageId: "18c2f0a9",
      action: "archive",
    });

    await expect(
      Promise.all([
        refused("setInboxOpen", {}),
        refused("setInboxOpen", { open: "yes" }),
        refused("openInboxMessage", { profileId: "a" }),
        refused("openInboxMessage", { profileId: "", messageId: "18c2" }),
        // Not the feed's lowercase hex: a URL, a path, upper case, too long.
        refused("openInboxMessage", {
          profileId: "a",
          messageId: "https://mail.google.com/",
        }),
        refused("openInboxMessage", { profileId: "a", messageId: "../18c2" }),
        refused("openInboxMessage", { profileId: "a", messageId: "18C2" }),
        refused("openInboxMessage", {
          profileId: "a",
          messageId: "a".repeat(33),
        }),
        refused("runInboxAction", {
          profileId: "a",
          messageId: "18c2",
          action: "forward",
        }),
        refused("runInboxAction", { profileId: "a", messageId: "18c2" }),
      ])
    ).resolves.toStrictEqual(Array.from({ length: 10 }, () => true));
    expect(shell.calls).toStrictEqual([
      ["setInboxOpen", { open: true }],
      ["openInboxMessage", { profileId: "a", messageId: "18c2f0a9" }],
      [
        "runInboxAction",
        { profileId: "a", messageId: "18c2f0a9", action: "archive" },
      ],
    ]);
  });

  it("passes New tab's choice of a registered app and refuses any other", async () => {
    const shell = setup();
    const refusals = await Promise.allSettled(
      [{}, { appId: "tasks" }, { appId: "https://example.com/" }].map(
        (request) => shell.call(SHELL, "openApp", request)
      )
    );

    await shell.call(SHELL, "openApp", { appId: "calendar" });

    expect([
      refusals.map(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof RefusedCallError
      ),
      shell.calls,
    ]).toStrictEqual([
      [true, true, true],
      [["openApp", { appId: "calendar" }]],
    ]);
  });

  it("passes a tab menu and More options at a whole point of the window, and refuses any other", async () => {
    const shell = setup();
    const tab = { profileId: "a", tabId: "gmail" };
    const refusals = await Promise.allSettled([
      shell.call(SHELL, "openTabMenu", { ...tab, x: 1.5, y: 2 }),
      shell.call(SHELL, "openTabMenu", { ...tab, x: -1, y: 2 }),
      shell.call(SHELL, "openTabMenu", { ...tab, x: 1 }),
      shell.call(SHELL, "openOwnWindowMenu", { ...tab, x: 1, y: 0.5 }),
    ]);

    await shell.call(SHELL, "openTabMenu", { ...tab, x: 12, y: 40 });
    await shell.call(SHELL, "openOwnWindowMenu", { ...tab, x: 700, y: 20 });

    expect([
      refusals.map(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof RefusedCallError
      ),
      shell.calls,
    ]).toStrictEqual([
      [true, true, true, true],
      [
        ["openTabMenu", { ...tab, x: 12, y: 40 }],
        ["openOwnWindowMenu", { ...tab, x: 700, y: 20 }],
      ],
    ]);
  });

  it("passes a profile menu at a whole point of the window, and refuses any other", async () => {
    const shell = setup();
    const refusals = await Promise.allSettled([
      shell.call(SHELL, "openProfileMenu", { profileId: "b", x: 1.5, y: 2 }),
      shell.call(SHELL, "openProfileMenu", { profileId: "", x: 1, y: 2 }),
    ]);

    await shell.call(SHELL, "openProfileMenu", { profileId: "b", x: 12, y: 4 });

    expect([
      refusals.map(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof RefusedCallError
      ),
      shell.calls,
    ]).toStrictEqual([
      [true, true],
      [["openProfileMenu", { profileId: "b", x: 12, y: 4 }]],
    ]);
  });

  it("passes a move of a tab before another or to its area's end, and refuses one before nothing", async () => {
    const shell = setup();
    const tab = { profileId: "a", tabId: "t1" };
    const refused = await Promise.allSettled([
      shell.call(SHELL, "moveTab", { ...tab, before: "" }),
    ]);

    await shell.call(SHELL, "moveTab", { ...tab, before: "gmail" });
    await shell.call(SHELL, "moveTab", tab);

    expect([
      refused.map(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof RefusedCallError
      ),
      shell.calls,
    ]).toStrictEqual([
      [true],
      [
        ["moveTab", { ...tab, before: "gmail" }],
        ["moveTab", tab],
      ],
    ]);
  });

  it("refuses a call from a content view or an unknown sender", async () => {
    const shell = setup();

    // The overlay's document is on the shell's origin, which it inherits.
    await expect(
      shell.call(OVERLAY, "closeOverlay", {})
    ).rejects.toBeInstanceOf(RefusedCallError);

    await expect(
      shell.call(CONTENT_VIEW, "toggleSidebar", {})
    ).rejects.toBeInstanceOf(RefusedCallError);
    await expect(
      shell.call(UNKNOWN, "toggleSidebar", {})
    ).rejects.toBeInstanceOf(RefusedCallError);
    expect(shell.calls).toStrictEqual([]);
  });

  it("refuses a call or a handshake from a subframe of the shell, or from another origin in it", async () => {
    const shell = setup();
    const strangers: IpcSender[] = [
      { webContentsId: SHELL, isMainFrame: false, origin: SHELL_ORIGIN },
      {
        webContentsId: SHELL,
        isMainFrame: true,
        origin: "https://example.com",
      },
      { webContentsId: SHELL, isMainFrame: true, origin: undefined },
    ];
    const results = await Promise.allSettled(
      strangers.map((sender) => shell.call(sender, "toggleSidebar", {}))
    );

    for (const sender of strangers) {
      shell.handshake(sender);
    }

    expect(
      results.map(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof RefusedCallError
      )
    ).toStrictEqual([true, true, true]);
    expect(shell.calls).toStrictEqual([]);
    expect(shell.sentTo(SHELL)).toStrictEqual([]);
  });

  it("sends nothing before the handshake", () => {
    const shell = setup();

    shell.change({ profiles: profilesSlice("b") });

    expect(shell.sentTo(SHELL)).toStrictEqual([]);
  });

  it("sends a snapshot on the handshake, then a patch per change", () => {
    const shell = setup();

    shell.handshake(SHELL);
    shell.change({ profiles: profilesSlice("b") });
    // Unchanged slices send nothing.
    shell.change({ profiles: profilesSlice("b") });

    expect(shell.sentTo(SHELL)).toStrictEqual([
      { kind: "snapshot", slices: { profiles: profilesSlice("a") } },
      { kind: "patch", slice: "profiles", value: profilesSlice("b") },
    ]);
  });

  it("serves a second subscriber its own snapshot, and both the patches", () => {
    const shell = setup();

    shell.handshake(SHELL);
    shell.change({ profiles: profilesSlice("b") });
    shell.handshake(OTHER_SHELL);
    shell.change({ profiles: profilesSlice("a") });

    expect(shell.sentTo(SHELL)).toStrictEqual([
      { kind: "snapshot", slices: { profiles: profilesSlice("a") } },
      { kind: "patch", slice: "profiles", value: profilesSlice("b") },
      { kind: "patch", slice: "profiles", value: profilesSlice("a") },
    ]);
    expect(shell.sentTo(OTHER_SHELL)).toStrictEqual([
      { kind: "snapshot", slices: { profiles: profilesSlice("b") } },
      { kind: "patch", slice: "profiles", value: profilesSlice("a") },
    ]);
  });

  it("refuses a handshake from a non-shell or naming an unknown slice", () => {
    const shell = setup();

    shell.handshake(CONTENT_VIEW);
    shell.handshake(SHELL, ["profiles", "secrets"]);
    shell.change({ profiles: profilesSlice("b") });

    expect(shell.sentTo(CONTENT_VIEW)).toStrictEqual([]);
    expect(shell.sentTo(SHELL)).toStrictEqual([]);
    expect(shell.logs).toHaveLength(2);
  });

  it("stops sending to a shell whose webContents is gone", () => {
    const shell = setup();
    const unregister = shell.senders.register(4, { role: "shell" });

    shell.handshake(4);
    unregister();
    shell.change({ profiles: profilesSlice("b") });

    expect(shell.sentTo(4)).toStrictEqual([
      { kind: "snapshot", slices: { profiles: profilesSlice("a") } },
    ]);
  });
});

describe(createShellSource, () => {
  const PRO: ShellState["pro"] = {
    trialChoice: true,
    firstProfile: null,
    trialFooterDays: null,
    licenseRequest: false,
    standing: {
      status: "trialEnded",
      unconfirmedReason: null,
      trialDaysLeft: null,
      downgradePending: false,
      hasLicenseKey: false,
    },
  };

  const sourceSetup = () => {
    const launched: unknown[] = [];
    const launchListeners: (() => void)[] = [];
    let launchState = { language: "en", pro: PRO };
    const source = createShellSource({
      handlers: {
        activateLicense: (request) => {
          launched.push(["activateLicense", request]);

          return Promise.resolve({ ok: true } as const);
        },
        retryEntitlement: () => Promise.resolve(),
        continueFree: () => {
          launched.push(["continueFree"]);

          return Promise.resolve({ ok: true } as const);
        },
        openMeruPro: () => Promise.resolve(),
      },
      state: {
        read: () => launchState,
        onChange: (listener) => {
          launchListeners.push(listener);
        },
      },
    });
    let told = 0;

    source.state.onChange(() => {
      told += 1;
    });

    return {
      source,
      launched,
      told: () => told,
      moveLaunch: (pro: ShellState["pro"]) => {
        launchState = { ...launchState, pro };

        for (const listener of launchListeners) {
          listener();
        }
      },
    };
  };

  it("answers the trial-ended screen's calls and slices before the app starts, and refuses every other call", async () => {
    const { source, launched, told, moveLaunch } = sourceSetup();

    await source.handlers.continueFree(undefined);

    expect(launched).toStrictEqual([["continueFree"]]);
    expect(() =>
      source.handlers.selectTab({ profileId: "a", tabId: "gmail" })
    ).toThrow(RefusedCallError);
    expect(source.state.read()).toStrictEqual({ language: "en", pro: PRO });

    moveLaunch({ ...PRO, licenseRequest: true });

    expect([told(), source.state.read().pro?.licenseRequest]).toStrictEqual([
      1,
      true,
    ]);
  });

  it("answers from the app's once started, telling the change, and only once", async () => {
    const { source, told, moveLaunch } = sourceSetup();
    const appCalls: unknown[] = [];
    const appListeners: (() => void)[] = [];
    const appState = { language: "de", pro: { ...PRO, trialChoice: false } };
    const app = {
      handlers: {
        selectTab: (request: unknown) => {
          appCalls.push(request);

          return Promise.resolve();
        },
      } as unknown as ShellHandlers,
      state: {
        read: () => appState as unknown as ShellState,
        onChange: (listener: () => void) => {
          appListeners.push(listener);
        },
      },
    };

    source.start(app);
    await source.handlers.selectTab({ profileId: "a", tabId: "gmail" });

    expect([told(), appCalls, source.state.read()]).toStrictEqual([
      1,
      [{ profileId: "a", tabId: "gmail" }],
      appState,
    ]);

    // The launch's own changes no longer tell; the app's do.
    moveLaunch(PRO);

    for (const listener of appListeners) {
      listener();
    }

    expect(told()).toBe(2);
    expect(() => {
      source.start(app);
    }).toThrow("started already");
  });
});
