import { describe, expect, it } from "vitest";

import type { MenuPoint } from "#core/context-menu.ts";
import { isAsleep, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { ContextMenuItem } from "#platform/context-menu.ts";

import { createProfileMenu } from "./profile-menu.ts";
import { createProfiles } from "./profiles.ts";

const two: State = {
  version: 1,
  profiles: [newProfile("a", "Default"), newProfile("b", "Work")],
  selectedProfileId: "a",
};

/** The menu over the real profiles, saving nowhere, and a window that records each popup. */
const setup = () => {
  const logs: string[] = [];
  const popups: { items: readonly ContextMenuItem[]; at?: MenuPoint }[] = [];
  const profiles = createProfiles({
    initial: two,
    save: () => Promise.resolve(),
    newId: () => "new",
    profileName: (n) => `Profile ${n}`,
    clearSession: () => Promise.resolve(),
    now: () => 0,
    log: () => false,
  });
  const menu = createProfileMenu({
    state: profiles.get,
    window: {
      getContentAreaSize: () => ({ width: 800, height: 600 }),
      showContextMenu: (items, at) => {
        popups.push({ items, ...(at && { at }) });
      },
    },
    profiles,
    log: (message) => {
      logs.push(message);
    },
  });
  const asleep = () => {
    const state = profiles.get();

    return state.profiles
      .filter((profile) => isAsleep(state, profile))
      .map((profile) => profile.id);
  };
  const shown = () =>
    popups
      .at(-1)
      ?.items.map((item) =>
        "type" in item ? "—" : `${item.label}${item.enabled ? "" : " (off)"}`
      );
  /** Opens the profile's menu and clicks its only item. */
  const choose = async (profileId: string) => {
    menu.open({ profileId, x: 120, y: 20 });

    const [item] = popups.at(-1)?.items ?? [];

    if (item && !("type" in item)) {
      await item.click?.();
    }
  };

  return { menu, profiles, popups, logs, asleep, shown, choose };
};

describe(createProfileMenu, () => {
  it("pops up at the point asked for a listed profile, and refuses one outside the content area", () => {
    const { menu, popups, logs, shown } = setup();

    menu.open({ profileId: "b", x: 120, y: 20 });
    menu.open({ profileId: "b", x: 900, y: 20 });

    expect([popups.map(({ at }) => at), shown(), logs]).toStrictEqual([
      [{ x: 120, y: 20 }],
      ["Sleep"],
      ["Refused a menu for profile b at 900,20"],
    ]);
  });

  it("puts its profile to sleep, leaving the selection", async () => {
    const { profiles, asleep, choose } = setup();

    await choose("b");

    expect([asleep(), profiles.get().selectedProfileId]).toStrictEqual([
      ["b"],
      "a",
    ]);
  });

  it("offers Wake for its sleeping profile, which selects it", async () => {
    const { profiles, asleep, shown, choose } = setup();

    await profiles.sleep("b");
    await choose("b");

    expect([shown(), asleep(), profiles.get().selectedProfileId]).toStrictEqual(
      [["Wake"], [], "b"]
    );
  });

  it("offers Sleep disabled for the last awake profile, and refuses it", async () => {
    const { profiles, logs, asleep, shown, choose } = setup();

    await profiles.sleep("b");
    await choose("a");

    expect([shown(), asleep(), logs]).toStrictEqual([
      ["Sleep (off)"],
      ["b"],
      ["Refused the profile menu's sleep, which it does not offer"],
    ]);
  });
});
