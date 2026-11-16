import { delay } from "es-toolkit";
import { describe, expect, it } from "vitest";

import type { State } from "#core/state.ts";
import type { Confirmation, ContextMenuItem } from "#platform/window.ts";

import { createShellHandlers, shellState } from "./shell-handlers.ts";

const two: State = {
  version: 1,
  profiles: [
    { id: "a", name: "Default" },
    { id: "b", name: "Work" },
  ],
  selectedProfileId: "a",
};

const setup = ({ state = two, confirmed = true } = {}) => {
  const removed: string[] = [];
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

  return { handlers, removed, menus, confirmations };
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
      state: { ...two, profiles: [{ id: "a", name: "Default" }] },
    });

    await shell.handlers.openProfileMenu({ profileId: "a" });

    expect(shell.menus[0]?.[0]?.enabled).toBeFalsy();
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
      shellState({
        ...two,
        profiles: [
          { id: "a", name: "Default", color: "teal" },
          { id: "b", name: "Work" },
        ],
      })
    ).toStrictEqual({
      profiles: {
        profiles: [
          { id: "a", name: "Default" },
          { id: "b", name: "Work" },
        ],
        selectedProfileId: "a",
      },
    });
  });
});
