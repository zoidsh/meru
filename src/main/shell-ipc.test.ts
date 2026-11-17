import { describe, expect, it } from "vitest";

import { SHELL_CHANNELS } from "#contract/shell.ts";
import type { ShellState } from "#contract/shell.ts";
import type { Ipc, IpcSender } from "#platform/ipc.ts";

import { createSenderRegistry } from "./senders.ts";
import { RefusedCallError, serveShellContract } from "./shell-ipc.ts";
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
  tabs: [
    {
      id: "gmail",
      app: "gmail",
      title: "",
      closable: false,
      status: { kind: "live" },
    },
  ],
};

const NO_MAIL = { status: "unknown", unreadCount: null } as const;

const profilesSlice = (selectedProfileId: string) => ({
  profiles: [
    { id: "a", name: "Default", mail: NO_MAIL },
    { id: "b", name: "Profile 2", mail: NO_MAIL },
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
    profiles: profilesSlice("a"),
    tabs: TABS,
    shortcuts: {},
    doNotDisturb: { on: false, until: null },
    overlay: { kind: "none" },
    inbox: { open: false, profiles: [], rows: [], notice: null },
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
    selectProfile: (request) => {
      calls.push(["selectProfile", request]);

      return Promise.resolve();
    },
    addProfile: (request) => {
      calls.push(["addProfile", request]);

      return Promise.resolve();
    },
    openProfileMenu: (request) => {
      calls.push(["openProfileMenu", request]);

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
    retryTab: (request) => {
      calls.push(["retryTab", request]);

      return Promise.resolve();
    },
    renameProfile: (request) => {
      calls.push(["renameProfile", request]);

      return Promise.resolve();
    },
    closeOverlay: (request) => {
      calls.push(["closeOverlay", request]);

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
    runInboxAction: (request) => {
      calls.push(["runInboxAction", request]);

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
    const handler = handled.get(SHELL_CHANNELS.call(name as "addProfile"));

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
    await shell.call(SHELL, "addProfile", {});

    expect(shell.calls).toStrictEqual([
      ["selectProfile", { profileId: "b" }],
      ["addProfile", {}],
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

  it("refuses a call from a content view or an unknown sender", async () => {
    const shell = setup();

    // The overlay's document is on the shell's origin, which it inherits.
    await expect(
      shell.call(OVERLAY, "closeOverlay", {})
    ).rejects.toBeInstanceOf(RefusedCallError);

    await expect(
      shell.call(CONTENT_VIEW, "addProfile", {})
    ).rejects.toBeInstanceOf(RefusedCallError);
    await expect(shell.call(UNKNOWN, "addProfile", {})).rejects.toBeInstanceOf(
      RefusedCallError
    );
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
      strangers.map((sender) => shell.call(sender, "addProfile", {}))
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
