import { delay } from "es-toolkit";
import { describe, expect, it } from "vitest";

import type { Overlay } from "#core/overlay.ts";
import { SETTINGS } from "#core/settings.ts";
import type { SettingKey, SettingValue } from "#core/settings.ts";
import { gmailTab, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { TabStatus } from "#core/tab-machine.ts";
import type { Confirmation, ContextMenuItem } from "#platform/window.ts";

import {
  createShellHandlers,
  shellSettings,
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
  confirmed = true,
  overlay = undefined as Overlay | undefined,
} = {}) => {
  const removed: string[] = [];
  const renamed: [string, string][] = [];
  let open = overlay;
  const overlays: (Overlay | "closed")[] = [];
  const calls: unknown[] = [];
  const menus: Item[][] = [];
  const ran: string[] = [];
  const confirmations: Confirmation[] = [];

  const handlers = createShellHandlers({
    profiles: {
      get: () => state,
      select: (profileId) => {
        calls.push(["selectProfile", profileId]);

        return Promise.resolve(true);
      },
      add: () => {
        calls.push(["add"]);

        return Promise.resolve(true);
      },
      remove: (profileId) => {
        removed.push(profileId);

        return Promise.resolve(true);
      },
      rename: (profileId, name) => {
        renamed.push([profileId, name]);

        return Promise.resolve(true);
      },
      selectTab: (key) => {
        calls.push(["select", key]);

        return Promise.resolve(true);
      },
      closeTab: (key) => {
        calls.push(["close", key]);

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
    window: {
      showContextMenu: (items) => menus.push(items.filter(isItem)),
      confirm: (confirmation) => {
        confirmations.push(confirmation);

        return Promise.resolve(confirmed);
      },
    },
    runCommand: (id) => {
      ran.push(id);
    },
    doNotDisturbItems: () => [
      { label: "For 5 Minutes", enabled: true, click: () => {} },
    ],
    log: () => false,
  });

  return {
    handlers,
    removed,
    renamed,
    overlays,
    calls,
    menus,
    confirmations,
    ran,
  };
};

const settle = () => delay(0);

describe(createShellHandlers, () => {
  it("offers to remove a profile and removes it once confirmed", async () => {
    const shell = setup();

    await shell.handlers.openProfileMenu({ profileId: "b" });

    const [, item] = shell.menus[0] ?? [];

    expect(item?.label).toBe("Remove Work…");
    expect(item?.enabled).toBeTruthy();

    item?.click?.();
    await settle();

    expect(shell.confirmations).toStrictEqual([
      {
        message: "Remove Work?",
        detail:
          "Meru signs out of this profile and deletes its data on this device. Your Google account isn't affected.",
        confirmLabel: "Remove Profile",
        cancelLabel: "Cancel",
      },
    ]);
    expect(shell.removed).toStrictEqual(["b"]);
  });

  it("removes nothing when the confirmation is cancelled", async () => {
    const shell = setup({ confirmed: false });

    await shell.handlers.openProfileMenu({ profileId: "a" });
    shell.menus[0]?.[1]?.click?.();
    await settle();

    expect(shell.confirmations[0]?.message).toBe("Remove Default?");
    expect(shell.removed).toStrictEqual([]);
  });

  it("offers removal of the last profile disabled", async () => {
    const shell = setup({
      state: { ...two, profiles: [newProfile("a", "Default")] },
    });

    await shell.handlers.openProfileMenu({ profileId: "a" });

    expect(shell.menus[0]?.[1]?.enabled).toBeFalsy();
  });

  it("offers to rename a profile above removing it, which opens its rename overlay", async () => {
    const shell = setup();

    await shell.handlers.openProfileMenu({ profileId: "b" });

    const [item] = shell.menus[0] ?? [];

    expect(item).toMatchObject({ label: "Rename…", enabled: true });

    item?.click?.();

    expect(shell.overlays).toStrictEqual([
      { kind: "rename-profile", profileId: "b" },
    ]);
  });

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

  it("closes the unified inbox after selecting or adding a profile", async () => {
    const shell = setup();

    await shell.handlers.selectProfile({ profileId: "a" });
    await shell.handlers.addProfile({});

    expect(shell.calls).toStrictEqual([
      ["selectProfile", "a"],
      ["inbox", false],
      ["add"],
      ["inbox", false],
    ]);
  });

  it("shows no menu for a profile that is not listed", async () => {
    const shell = setup();

    await shell.handlers.openProfileMenu({ profileId: "gone" });

    expect(shell.menus).toStrictEqual([]);
  });
});

const SHOWN_SETTINGS = { design: "modern", vibrancy: true } as const;

const CLOSED_INBOX = { open: false, profiles: [], rows: [], notice: null };

const NO_MAIL = { status: "unknown", unreadCount: null } as const;

describe(shellState, () => {
  it("gives the shell the profiles with names to show and their mail, and nothing else of them", () => {
    expect(
      shellState(
        {
          ...two,
          profiles: [
            { ...newProfile("a", "Default"), color: "teal" },
            newProfile("b", "Work"),
          ],
        },
        () => ({ kind: "live" }),
        SHOWN_SETTINGS,
        undefined,
        (profileId) =>
          profileId === "a" ? { status: "ok", unreadCount: 4 } : NO_MAIL,
        undefined,
        CLOSED_INBOX
      ).profiles
    ).toStrictEqual({
      profiles: [
        { id: "a", name: "Default", mail: { status: "ok", unreadCount: 4 } },
        { id: "b", name: "Work", mail: NO_MAIL },
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
        SHOWN_SETTINGS,
        undefined,
        () => NO_MAIL,
        undefined,
        CLOSED_INBOX
      ).tabs
    ).toStrictEqual({
      profileId: "a",
      selectedTabId: "c1",
      tabs: [
        {
          id: "gmail",
          app: "gmail",
          title: "Inbox",
          closable: false,
          status: { kind: "unloaded" },
        },
        {
          id: "c1",
          app: "calendar",
          title: "Week",
          closable: true,
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
          closable: true,
          status: { kind: "crashed" },
        },
      ],
    });
  });
});

const overlaySlice = (open: Overlay | undefined) =>
  shellState(
    two,
    () => ({ kind: "live" }),
    SHOWN_SETTINGS,
    open,
    () => NO_MAIL,
    undefined,
    CLOSED_INBOX
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

  it("is none for a profile that is gone", () => {
    expect(
      overlaySlice({ kind: "rename-profile", profileId: "gone" })
    ).toStrictEqual({ kind: "none" });
  });
});

describe(shellSettings, () => {
  const settings = { design: "classic", vibrancy: true } as const;
  const get = <Key extends SettingKey>(key: Key) =>
    (key in settings
      ? settings[key as keyof typeof settings]
      : SETTINGS[key].default) as SettingValue<Key>;

  it("gives the shell the design, and vibrancy on macOS alone", () => {
    expect(shellSettings(get, true)).toStrictEqual(settings);
    expect(shellSettings(get, false)).toStrictEqual({
      design: "classic",
      vibrancy: false,
    });
  });
});

const doNotDisturbSlice = (doNotDisturb: State["doNotDisturb"]) =>
  shellState(
    two,
    () => ({ kind: "live" }),
    SHOWN_SETTINGS,
    undefined,
    () => NO_MAIL,
    doNotDisturb,
    CLOSED_INBOX
  ).doNotDisturb;

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
