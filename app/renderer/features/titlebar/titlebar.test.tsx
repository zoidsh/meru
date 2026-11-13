import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  groupOf,
  mountChrome,
  profileOf,
  stageOf,
  tabOf,
} from "../../testing.tsx";
import type { Answers } from "../../testing.tsx";
import { Titlebar } from "./titlebar.tsx";

const mounted: (() => void)[] = [];

const profilesAnswer = (profiles: ReturnType<typeof profileOf>[]) => ({
  groups: profiles.map((profile) =>
    groupOf(`group-${profile.id}`, [`gmail-${profile.id}`], profile.id)
  ),
  profiles,
  selectedProfileId: profiles[0]?.id ?? "personal",
  tabs: profiles.map((profile) =>
    tabOf(`gmail-${profile.id}`, "gmail", profile.id)
  ),
});

const mount = (answers: Answers) => {
  const page = mountChrome(<Titlebar trailing={<i data-trailing="" />} />, {
    "sidebar.snapshot": { kind: "hidden" },
    "stage.snapshot": stageOf(),
    ...answers,
  });
  mounted.push(page.unmount);
  const buttons = () => [
    ...page.container.querySelectorAll<HTMLButtonElement>("[data-profile-id]"),
  ];
  return { ...page, buttons };
};

describe(Titlebar, () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount();
    }
  });

  it("shows no profile row while there is one profile", () => {
    const { container } = mount({
      "profiles.snapshot": profilesAnswer([profileOf("personal")]),
    });
    expect(container.querySelector("[data-profile-row]")).toBeNull();
  });

  it("shows a button per profile the entitlement allows, the selected one secondary, and selects one on a click", () => {
    const { buttons, sentOn } = mount({
      "profiles.snapshot": profilesAnswer([
        profileOf("personal", { order: 0 }),
        profileOf("work", { order: 1 }),
        profileOf("club", { order: 2 }),
        profileOf("old", { deactivated: true, order: 3 }),
      ]),
    });
    expect(
      buttons().map((button) => [
        button.textContent,
        button.dataset.selected === "true",
      ])
    ).toStrictEqual([
      ["personal", true],
      ["work", false],
      ["club", false],
    ]);
    act(() => {
      buttons()[1]?.click();
    });
    expect(sentOn("profiles.select")).toStrictEqual([{ profileId: "work" }]);
  });

  it("marks a profile that needs signing in, and shows the unread count of the rest unless profiles.unreadBadge is off", () => {
    const answers = {
      "profiles.snapshot": profilesAnswer([
        profileOf("personal", {
          order: 0,
          status: { kind: "ok", unreadCount: 12 },
        }),
        profileOf("work", {
          order: 1,
          status: { kind: "needsSignIn", unreadCount: 3 },
        }),
      ]),
    };
    const shown = mount(answers);
    const hidden = mount({
      ...answers,
      "settings.snapshot": {
        global: { "profiles.unreadBadge": false },
        profiles: {},
      },
    });
    const badges = (page: typeof shown) =>
      page
        .buttons()
        .map((button) => [
          button.querySelector("[data-unread-badge]")?.textContent,
          button.title,
        ]);
    expect([badges(shown), badges(hidden)]).toStrictEqual([
      [
        ["12", ""],
        [undefined, "work needs you to sign in"],
      ],
      [
        [undefined, ""],
        [undefined, "work needs you to sign in"],
      ],
    ]);
  });

  it("goes back, forward and reloads the focused pane, and stops it while it loads", () => {
    const { container, sentOn, push } = mount({
      "profiles.snapshot": profilesAnswer([profileOf("personal")]),
      "stage.snapshot": stageOf({
        navigation: { canGoBack: true, canGoForward: false, loading: false },
      }),
    });
    const controls = () => [
      ...container.querySelectorAll<HTMLButtonElement>("header button"),
    ];
    expect(controls().map((button) => button.disabled)).toStrictEqual([
      false,
      true,
      false,
    ]);
    act(() => {
      controls()[0]?.click();
      controls()[2]?.click();
    });
    push(
      "stage.changed",
      stageOf({
        navigation: { canGoBack: true, canGoForward: false, loading: true },
      })
    );
    act(() => {
      controls()[2]?.click();
    });
    expect(sentOn("stage.navigate")).toStrictEqual([
      { action: "back" },
      { action: "reload" },
      { action: "stop" },
    ]);
  });

  it("holds what goes at its right end only while the sidebar is hidden", () => {
    const { container, push } = mount({
      "profiles.snapshot": profilesAnswer([profileOf("personal")]),
    });
    const trailing = () => container.querySelector("[data-trailing]") !== null;
    const before = trailing();
    push("sidebar.changed", { kind: "shown", size: "narrow", width: 64 });
    expect([before, trailing()]).toStrictEqual([true, false]);
  });
});
