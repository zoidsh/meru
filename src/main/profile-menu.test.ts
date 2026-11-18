import { describe, expect, it } from "vitest";

import type { Overlay } from "#core/overlay.ts";
import { isAsleep, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";

import { createProfileMenu } from "./profile-menu.ts";
import { createProfiles } from "./profiles.ts";

const two: State = {
  version: 1,
  profiles: [newProfile("a", "Default"), newProfile("b", "Work")],
  selectedProfileId: "a",
};

/** The menu over the real profiles, saving nowhere, and an overlay that records. */
const setup = () => {
  const logs: string[] = [];
  const events: unknown[] = [];
  let open: Overlay | undefined;
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
    contentSize: () => ({ width: 800, height: 600 }),
    overlays: {
      open: (next) => {
        open = next;
        events.push(["open", next]);
      },
      close: () => {
        open = undefined;
        events.push(["closed"]);
      },
      current: () => open,
    },
    profiles,
    log: (message) => {
      logs.push(message);
    },
  });
  const asleep = () =>
    profiles
      .get()
      .profiles.filter(isAsleep)
      .map((profile) => profile.id);

  return { menu, profiles, events, logs, asleep };
};

describe(createProfileMenu, () => {
  it("opens at the point asked for a listed profile, and refuses one outside the content area", () => {
    const { menu, events, logs } = setup();

    menu.open({ profileId: "b", x: 120, y: 20 });
    menu.open({ profileId: "b", x: 900, y: 20 });

    expect([events, logs]).toStrictEqual([
      [["open", { kind: "profile-menu", profileId: "b", x: 120, y: 20 }]],
      ["Refused a menu for profile b at 900,20"],
    ]);
  });

  it("puts its profile to sleep, leaving the selection, and closes", async () => {
    const { menu, profiles, events, asleep } = setup();

    menu.open({ profileId: "b", x: 120, y: 20 });
    await menu.run("sleep");

    expect([
      asleep(),
      profiles.get().selectedProfileId,
      events.at(-1),
    ]).toStrictEqual([["b"], "a", ["closed"]]);
  });

  it("wakes its sleeping profile by selecting it", async () => {
    const { menu, profiles, asleep } = setup();

    await profiles.sleep("b");
    menu.open({ profileId: "b", x: 120, y: 20 });
    await menu.run("wake");

    expect([asleep(), profiles.get().selectedProfileId]).toStrictEqual([
      [],
      "b",
    ]);
  });

  it("refuses an item it does not offer, or with no profile menu open, and still closes its own", async () => {
    const { menu, events, logs, asleep } = setup();

    await menu.run("sleep");
    menu.open({ profileId: "b", x: 120, y: 20 });
    await menu.run("wake");

    expect([asleep(), events.at(-1), logs]).toStrictEqual([
      [],
      ["closed"],
      [
        "Refused the profile menu's sleep with no profile menu open",
        "Refused the profile menu's wake, which it does not offer",
      ],
    ]);
  });
});
