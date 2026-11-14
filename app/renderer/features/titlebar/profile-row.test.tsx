import { act } from "react";
import { describe, expect, it } from "vitest";

import { profiles, profilesPushes } from "../../../shared/channels/profiles.ts";
import type { ProfilesSnapshot } from "../../../shared/channels/profiles.ts";
import {
  answer,
  groupOf,
  mountChrome,
  profileOf,
  tabOf,
} from "../../testing.tsx";
import { ProfileRow } from "./profile-row.tsx";

const snapshotOf = (ids: readonly string[]): ProfilesSnapshot => ({
  groups: ids.map((id) => groupOf(`group-${id}`, [`gmail-${id}`], id)),
  newProfileRefusal: null,
  profiles: ids.map((id, order) => profileOf(id, { order })),
  selectedProfileId: ids[0] ?? "personal",
  tabs: ids.map((id) => tabOf(`gmail-${id}`, "gmail", id)),
});

// happy-dom lays nothing out, so the row is given the widths a browser would measure.
const measure = (row: HTMLElement, scrollWidth: number) => {
  Object.defineProperty(row, "clientWidth", { configurable: true, value: 200 });
  Object.defineProperty(row, "scrollWidth", {
    configurable: true,
    value: scrollWidth,
  });
};

describe(ProfileRow, () => {
  it("shows the arrow to scroll right once a profile added overflows the row", async () => {
    const page = mountChrome(<ProfileRow />, [
      answer(profiles.snapshot, snapshotOf(["personal", "work"])),
    ]);
    const row = page.container.querySelector<HTMLElement>(
      "[data-profile-row] > div"
    );
    const right = () =>
      page.container.querySelector<HTMLButtonElement>(
        'button[title="Scroll profiles right"]'
      )?.disabled;
    if (row === null) {
      throw new Error("no profile row");
    }
    measure(row, 200);
    expect(right()).toBeTruthy();
    measure(row, 400);
    await act(async () => {
      page.push(
        profilesPushes.changed,
        snapshotOf(["personal", "work", "club"])
      );
      await Promise.resolve();
    });
    expect(right()).toBeFalsy();
  });
});
