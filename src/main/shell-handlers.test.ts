import { delay } from "es-toolkit";
import { describe, expect, it } from "vitest";

import { gmailTab, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { TabStatus } from "#core/tab-machine.ts";
import type { Confirmation, ContextMenuItem } from "#platform/window.ts";

import { createShellHandlers, shellState } from "./shell-handlers.ts";

const two: State = {
  version: 1,
  profiles: [newProfile("a", "Default"), newProfile("b", "Work")],
  selectedProfileId: "a",
};

const setup = ({ state = two, confirmed = true } = {}) => {
  const removed: string[] = [];
  const calls: unknown[] = [];
  const menus: ContextMenuItem[][] = [];
  const confirmations: Confirmation[] = [];

  const handlers = createShellHandlers({
    profiles: {
      get: () => state,
      select: () => Promise.resolve(true),
      add: () => Promise.resolve(true),
      remove: (profileId) => {
        removed.push(profileId);

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
    tabs: {
      retry: (key) => {
        calls.push(["retry", key]);
      },
    },
    window: {
      showContextMenu: (items) => menus.push(items),
      confirm: (confirmation) => {
        confirmations.push(confirmation);

        return Promise.resolve(confirmed);
      },
    },
    log: () => false,
  });

  return { handlers, removed, calls, menus, confirmations };
};

const settle = () => delay(0);

describe(createShellHandlers, () => {
  it("offers to remove a profile and removes it once confirmed", async () => {
    const shell = setup();

    await shell.handlers.openProfileMenu({ profileId: "b" });

    const [item] = shell.menus[0] ?? [];

    expect(item?.label).toBe("Remove Work…");
    expect(item?.enabled).toBeTruthy();

    item?.click();
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
    shell.menus[0]?.[0]?.click();
    await settle();

    expect(shell.confirmations[0]?.message).toBe("Remove Default?");
    expect(shell.removed).toStrictEqual([]);
  });

  it("offers removal of the last profile disabled", async () => {
    const shell = setup({
      state: { ...two, profiles: [newProfile("a", "Default")] },
    });

    await shell.handlers.openProfileMenu({ profileId: "a" });

    expect(shell.menus[0]?.[0]?.enabled).toBeFalsy();
  });

  it("hands each tab control's call to the tabs", async () => {
    const shell = setup();
    const key = { profileId: "a", tabId: "t1" };

    await shell.handlers.selectTab(key);
    await shell.handlers.closeTab(key);
    await shell.handlers.retryTab(key);

    expect(shell.calls).toStrictEqual([
      ["select", key],
      ["close", key],
      ["retry", key],
    ]);
  });

  it("shows no menu for a profile that is not listed", async () => {
    const shell = setup();

    await shell.handlers.openProfileMenu({ profileId: "gone" });

    expect(shell.menus).toStrictEqual([]);
  });
});

describe(shellState, () => {
  it("gives the shell the profiles with names to show, and nothing else of them", () => {
    expect(
      shellState(
        {
          ...two,
          profiles: [
            { ...newProfile("a", "Default"), color: "teal" },
            newProfile("b", "Work"),
          ],
        },
        () => ({ kind: "live" })
      ).profiles
    ).toStrictEqual({
      profiles: [
        { id: "a", name: "Default" },
        { id: "b", name: "Work" },
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
          statuses[`${profileId}/${tabId}`] ?? { kind: "unloaded" }
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
