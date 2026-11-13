import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { profiles } from "../../../shared/channels/profiles.ts";
import { answer, mountSettings, profileOf, tabOf } from "../../testing.tsx";
import { ProfilesPage } from "./profiles-page.tsx";

const mounted: (() => void)[] = [];

const FREE = "free";

const TRIAL = "trial";

const mount = (allowed: typeof FREE | typeof TRIAL) => {
  const page = mountSettings(<ProfilesPage />, [
    answer(profiles.snapshot, {
      groups: [],
      profiles: [
        profileOf("work", { label: "Work", order: 1 }),
        profileOf("personal", { label: "Personal", order: 0 }),
      ].map((profile) => ({
        ...profile,
        deactivated: allowed === FREE && profile.id === "work",
      })),
      newProfileRefusal: allowed === FREE ? "free" : null,
      selectedProfileId: "personal",
      tabs: [tabOf("mail", "gmail")],
    }),
    answer(profiles.update, null),
    answer(profiles.remove, null),
  ]);
  mounted.push(page.unmount);
  return page;
};

const buttons = () => [...document.querySelectorAll("button")];

const item = (id: string) =>
  document.querySelector<HTMLElement>(`[data-profile-id="${id}"]`);

// React tracks an input's value through its own setter, so the value is set past it for the change to reach onChange.
const type = (field: HTMLInputElement | null | undefined, text: string) => {
  act(() => {
    if (field === null || field === undefined) {
      return;
    }
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe(ProfilesPage, () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount();
    }
    vi.useRealTimers();
  });

  it("lists every profile in order, a deactivated one marked and kept, and shows the free gate's refusal in place of adding one", () => {
    mount(FREE);
    expect({
      add: [...document.querySelectorAll("button")].some(
        (button) => button.textContent === "Add profile"
      ),
      deactivated: item("work")?.dataset.deactivated,
      locked: document.querySelector("[data-locked]")?.textContent,
      order: [...document.querySelectorAll("[data-profile-id]")].map(
        (found) => found.querySelector("input")?.value
      ),
    }).toStrictEqual({
      add: false,
      deactivated: "",
      locked: "Upgrade to Meru Pro to add more profiles",
      order: ["Personal", "Work"],
    });
  });

  it("renames a profile with what was typed last once typing pauses, and recolours it at once, through profiles.update", () => {
    vi.useFakeTimers();
    const { sentOn } = mount(TRIAL);
    const last = () => sentOn(profiles.update).at(-1);
    type(item("work")?.querySelector("input"), "Off");
    type(item("work")?.querySelector("input"), "Office");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const renamed = last();
    act(() => {
      item("work")
        ?.querySelector<HTMLInputElement>("input[value='#30a46c']")
        ?.click();
    });
    expect({ recoloured: last(), renamed }).toStrictEqual({
      recoloured: { color: "#30a46c", profileId: "work" },
      renamed: { label: "Office", profileId: "work" },
    });
  });

  it("offers to add a profile while the entitlement allows it, and removes one only once asked", () => {
    const { sentOn } = mount(TRIAL);
    const add = buttons().some(
      (button) => button.textContent === "Add profile"
    );
    act(() => {
      buttons()
        .find(
          (button) =>
            button.textContent === "Remove…" &&
            item("work")?.contains(button) === true
        )
        ?.click();
    });
    const asked = sentOn(profiles.remove).at(-1);
    act(() => {
      buttons()
        .find((button) => button.textContent === "Remove profile")
        ?.click();
    });
    expect({
      add,
      asked,
      removed: sentOn(profiles.remove).at(-1),
    }).toStrictEqual({
      add: true,
      asked: undefined,
      removed: { profileId: "work" },
    });
  });
});
