import { describe, expect, it } from "vitest";

import { newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { Confirmation } from "#platform/window.ts";

import { createRemoveProfile } from "./remove-profile.ts";

const two: State = {
  version: 1,
  profiles: [newProfile("a", "Default"), newProfile("b", "Work")],
  selectedProfileId: "a",
};

const setup = (confirmed: boolean) => {
  const removed: string[] = [];
  const confirmations: Confirmation[] = [];
  const remove = createRemoveProfile({
    profiles: {
      get: () => two,
      remove: (profileId) => {
        removed.push(profileId);

        return Promise.resolve(true);
      },
    },
    window: {
      confirm: (confirmation) => {
        confirmations.push(confirmation);

        return Promise.resolve(confirmed);
      },
    },
    log: () => false,
  });

  return { remove, removed, confirmations };
};

describe(createRemoveProfile, () => {
  it("asks by the profile's name and removes it once confirmed", async () => {
    const { remove, removed, confirmations } = setup(true);

    await remove("b");

    expect(confirmations).toStrictEqual([
      {
        message: "Remove Work?",
        detail:
          "Meru signs out of this profile and deletes its data on this device. Your Google account isn't affected.",
        confirmLabel: "Remove Profile",
        cancelLabel: "Cancel",
      },
    ]);
    expect(removed).toStrictEqual(["b"]);
  });

  it("removes nothing when the confirmation is cancelled, and asks nothing for a profile that is gone", async () => {
    const { remove, removed, confirmations } = setup(false);

    await remove("a");
    await remove("gone");

    expect(confirmations.map(({ message }) => message)).toStrictEqual([
      "Remove Default?",
    ]);
    expect(removed).toStrictEqual([]);
  });
});
