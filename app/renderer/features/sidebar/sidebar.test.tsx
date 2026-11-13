import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { commands } from "../../../shared/channels/commands.ts";
import { profiles, tabs } from "../../../shared/channels/profiles.ts";
import { settings } from "../../../shared/channels/settings.ts";
import { sidebar } from "../../../shared/channels/sidebar.ts";
import { stage } from "../../../shared/channels/stage.ts";
import {
  answer,
  groupOf,
  mountChrome,
  profileOf,
  stageOf,
  tabOf,
} from "../../testing.tsx";
import type { Answers } from "../../testing.tsx";
import { Sidebar } from "./sidebar.tsx";

const mounted: (() => void)[] = [];

// Gmail alone, then Calendar and Drive split in one group.
const PROFILES = {
  groups: [
    groupOf("g-mail", ["mail"]),
    groupOf("g-work", ["calendar", "drive"]),
  ],
  profiles: [profileOf("personal", { status: { kind: "ok", unreadCount: 4 } })],
  selectedProfileId: "personal",
  tabs: [
    tabOf("mail", "gmail"),
    tabOf("calendar", "calendar"),
    tabOf("drive", "drive"),
  ],
};

const mount = (answers: Answers = []) => {
  const page = mountChrome(
    <Sidebar launcher={() => <i data-launcher="" />} />,
    [
      answer(profiles.snapshot, PROFILES),
      answer(sidebar.snapshot, { kind: "shown", size: "narrow", width: 64 }),
      answer(stage.snapshot, stageOf({ focusedPaneId: "pane-drive" })),
      ...answers,
    ]
  );
  mounted.push(page.unmount);
  const rows = () =>
    [...page.container.querySelectorAll<HTMLElement>("[data-tab-id]")].map(
      (row) => ({
        active: row.querySelector("[data-active]") !== null,
        badge: row.querySelector("[data-unread-badge]")?.textContent,
        grouped: row.parentElement?.dataset.groupId,
        id: row.dataset.tabId,
      })
    );
  return { ...page, rows };
};

describe(Sidebar, () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount();
    }
  });

  it("draws nothing while the strip is hidden", () => {
    const { container } = mount([answer(sidebar.snapshot, { kind: "hidden" })]);
    expect(container.querySelector("nav")).toBeNull();
  });

  it("draws a row per tab in sidebar order, a group's inside one outline, the focused pane's active, and the Gmail unread count", () => {
    const { rows } = mount();
    expect(rows()).toStrictEqual([
      { active: false, badge: "4", grouped: undefined, id: "mail" },
      { active: false, badge: undefined, grouped: "g-work", id: "calendar" },
      { active: true, badge: undefined, grouped: "g-work", id: "drive" },
    ]);
  });

  it("leaves the Gmail count to the inbox while Gmail is in front under whenInactive", () => {
    const whenInactive = answer(settings.snapshot, {
      global: { "sidebar.gmailUnreadBadge": "whenInactive" },
      profiles: {},
    });
    const inFront = mount([
      whenInactive,
      answer(stage.snapshot, stageOf({ focusedPaneId: "pane-mail" })),
    ]);
    const behind = mount([whenInactive]);
    expect([inFront.rows()[0]?.badge, behind.rows()[0]?.badge]).toStrictEqual([
      undefined,
      "4",
    ]);
  });

  it("brings a tab to the front on a click, and flips the width from its toggle", () => {
    const { container, sentOn } = mount();
    act(() => {
      container
        .querySelector<HTMLElement>("[data-tab-id=calendar] button")
        ?.click();
      container.querySelector<HTMLElement>("[data-width-toggle]")?.click();
    });
    expect([sentOn(tabs.focus), sentOn(commands.run)]).toStrictEqual([
      [{ tabId: "calendar" }],
      [{ id: "sidebar.toggleWidth" }],
    ]);
  });

  it("titles a row with its page and its app, and the width toggle with its shortcut once it has one", () => {
    const { container } = mount([
      answer(settings.snapshot, {
        global: {
          "shortcuts.bindings": { "sidebar.toggleWidth": "CmdOrCtrl+Shift+B" },
        },
        profiles: {},
      }),
    ]);
    expect([
      container.querySelector<HTMLElement>("[data-tab-id=calendar] button")
        ?.title,
      container.querySelector<HTMLElement>("[data-width-toggle]")?.title,
      container.querySelector("[data-launcher]") !== null,
    ]).toStrictEqual([
      "calendar calendar – Calendar",
      "Widen the sidebar (⇧⌘B)",
      true,
    ]);
  });
});
