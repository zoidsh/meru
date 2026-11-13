import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { commands } from "../../../shared/channels/commands.ts";
import { profiles } from "../../../shared/channels/profiles.ts";
import { settings } from "../../../shared/channels/settings.ts";
import { sidebar, sidebarPushes } from "../../../shared/channels/sidebar.ts";
import { stage, stagePushes } from "../../../shared/channels/stage.ts";
import {
  answer,
  groupOf,
  mountChrome,
  profileOf,
  stageOf,
  tabOf,
} from "../../testing.tsx";
import type { Answers } from "../../testing.tsx";
import { Titlebar } from "./titlebar.tsx";

const mounted: (() => void)[] = [];

const profilesAnswer = (shown: ReturnType<typeof profileOf>[]) =>
  answer(profiles.snapshot, {
    groups: shown.map((profile) =>
      groupOf(`group-${profile.id}`, [`gmail-${profile.id}`], profile.id)
    ),
    profiles: shown,
    selectedProfileId: shown[0]?.id ?? "personal",
    tabs: shown.map((profile) =>
      tabOf(`gmail-${profile.id}`, "gmail", profile.id)
    ),
  });

const mount = (answers: Answers) => {
  const page = mountChrome(<Titlebar trailing={<i data-trailing="" />} />, [
    answer(sidebar.snapshot, { kind: "hidden" }),
    answer(stage.snapshot, stageOf()),
    ...answers,
  ]);
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

  it("shows a fresh profile, its sidebar hidden, no profile row and what goes at its right end", () => {
    const { container } = mount([profilesAnswer([profileOf("personal")])]);
    expect([
      container.querySelector("[data-profile-row]"),
      container.querySelector("[data-trailing]") !== null,
    ]).toStrictEqual([null, true]);
  });

  it("shows a button per profile the entitlement allows, the selected one secondary, and selects one on a click", () => {
    const { buttons, sentOn } = mount([
      profilesAnswer([
        profileOf("personal", { order: 0 }),
        profileOf("work", { order: 1 }),
        profileOf("club", { order: 2 }),
        profileOf("old", { deactivated: true, order: 3 }),
      ]),
    ]);
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
    expect(sentOn(profiles.select)).toStrictEqual([{ profileId: "work" }]);
  });

  it("marks a profile that needs signing in, and shows the unread count of the rest unless profiles.unreadBadge is off", () => {
    const answers = [
      profilesAnswer([
        profileOf("personal", {
          order: 0,
          status: { kind: "ok", unreadCount: 12 },
        }),
        profileOf("work", {
          order: 1,
          status: { kind: "needsSignIn", unreadCount: 3 },
        }),
      ]),
    ];
    const shown = mount(answers);
    const hidden = mount([
      ...answers,
      answer(settings.snapshot, {
        global: { "profiles.unreadBadge": false },
        profiles: {},
      }),
    ]);
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

  it("runs back and reload as commands, titled with their shortcuts, and stops the focused pane while it loads", () => {
    const { container, sentOn, push } = mount([
      profilesAnswer([profileOf("personal")]),
      answer(commands.run, null),
      answer(
        stage.snapshot,
        stageOf({
          navigation: { canGoBack: true, canGoForward: false, loading: false },
        })
      ),
    ]);
    const controls = () => [
      ...container.querySelectorAll<HTMLButtonElement>("header button"),
    ];
    const titled = controls().map((button) => [button.disabled, button.title]);
    act(() => {
      controls()[0]?.click();
      controls()[2]?.click();
    });
    push(
      stagePushes.changed,
      stageOf({
        navigation: { canGoBack: true, canGoForward: false, loading: true },
      })
    );
    act(() => {
      controls()[2]?.click();
    });
    expect([
      titled,
      sentOn(commands.run),
      sentOn(stage.navigate),
    ]).toStrictEqual([
      [
        [false, "Go back (⌘[)"],
        [true, "Go forward (⌘])"],
        [false, "Reload page (⌘R)"],
      ],
      [{ id: "stage.back" }, { id: "stage.reload" }],
      [{ action: "stop" }],
    ]);
  });

  it("holds what goes at its right end only while the sidebar is hidden", () => {
    const { container, push } = mount([
      profilesAnswer([profileOf("personal")]),
    ]);
    const trailing = () => container.querySelector("[data-trailing]") !== null;
    const before = trailing();
    push(sidebarPushes.changed, { kind: "shown", size: "narrow", width: 64 });
    expect([before, trailing()]).toStrictEqual([true, false]);
  });
});
