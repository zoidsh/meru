import { describe, expect, it } from "vitest";

import type { Group } from "../records/group.ts";
import type { Tab } from "../records/tab.ts";
import { orderedTabs } from "./ordering.ts";
import {
  activeTabId,
  dropAction,
  showsGmailUnread,
  sidebarOf,
  zoneAt,
} from "./sidebar.ts";
import type { SidebarChoice } from "./sidebar.ts";

const tab = (appId: string): Tab => ({
  appId,
  health: "ok",
  id: `${appId}-${Math.random()}`,
  profileId: "p",
  sleeping: false,
  title: appId,
  url: "https://example.com/",
  zoom: 1,
});

const gmail = (appId: string) => appId === "gmail";

const auto: SidebarChoice = { hidden: false, width: "auto" };

describe(sidebarOf, () => {
  it("hides the sidebar for a fresh profile's one Gmail tab, with none, and when the user hid it", () => {
    expect(sidebarOf([tab("gmail")], auto, gmail)).toStrictEqual({
      kind: "hidden",
    });
    expect(sidebarOf([], auto, gmail)).toStrictEqual({ kind: "hidden" });
    expect(
      sidebarOf(
        [tab("gmail"), tab("calendar")],
        { ...auto, hidden: true },
        gmail
      )
    ).toStrictEqual({ kind: "hidden" });
  });

  it("is narrow under auto while every app has one tab, and wide once one has several", () => {
    expect(
      sidebarOf([tab("gmail"), tab("calendar")], auto, gmail)
    ).toStrictEqual({
      kind: "shown",
      size: "narrow",
      width: 64,
    });
    expect(
      sidebarOf([tab("gmail"), tab("drive"), tab("drive")], auto, gmail)
    ).toStrictEqual({ kind: "shown", size: "wide", width: 224 });
  });

  it("counts no pinned tab towards wide, as 3.x did", () => {
    expect(
      sidebarOf(
        [tab("gmail"), tab("drive"), tab("drive")],
        auto,
        (appId) => appId === "drive"
      )
    ).toMatchObject({ size: "narrow" });
  });

  it("takes the width the user set, and over it the one they flipped to", () => {
    const two = [tab("gmail"), tab("drive"), tab("drive")];
    expect(sidebarOf(two, { ...auto, width: "narrow" }, gmail)).toMatchObject({
      size: "narrow",
    });
    expect(
      sidebarOf(two, { ...auto, flipped: "wide", width: "narrow" }, gmail)
    ).toMatchObject({ size: "wide" });
  });
});

describe(showsGmailUnread, () => {
  it("shows the count always, never, or only while another tab is in front", () => {
    expect(
      (["always", "whenInactive", "never"] as const).flatMap((mode) => [
        showsGmailUnread({ gmailActive: true, mode, unreadBadge: true }),
        showsGmailUnread({ gmailActive: false, mode, unreadBadge: true }),
      ])
    ).toStrictEqual([true, true, false, true, false, false]);
  });

  it("shows no count while unread counts are off, whatever the mode", () => {
    expect(
      showsGmailUnread({
        gmailActive: false,
        mode: "always",
        unreadBadge: false,
      })
    ).toBeFalsy();
  });
});

describe(activeTabId, () => {
  const groups: Group[] = [
    {
      id: "g1",
      layout: { kind: "leaf", paneId: "p1", tabIds: ["mail"] },
      profileId: "p",
      tabIds: ["mail"],
    },
    {
      id: "g2",
      layout: {
        first: { kind: "leaf", paneId: "p2", tabIds: ["calendar"] },
        id: "s1",
        kind: "split",
        orientation: "vertical",
        ratio: 0.5,
        second: { kind: "leaf", paneId: "p3", tabIds: ["drive"] },
      },
      profileId: "p",
      tabIds: ["calendar", "drive"],
    },
  ];

  it("is the tab of the focused pane, in whichever group holds it", () => {
    expect([
      activeTabId(groups, "p1"),
      activeTabId(groups, "p3"),
    ]).toStrictEqual(["mail", "drive"]);
  });

  it("is none with no focused pane or one no group holds", () => {
    expect([
      activeTabId(groups, null),
      activeTabId(groups, "gone"),
    ]).toStrictEqual([undefined, undefined]);
  });
});

describe(zoneAt, () => {
  it("puts the top and bottom quarters of a row between rows and the rest onto it", () => {
    expect([0, 9, 10, 30, 31, 40].map((y) => zoneAt(0, 40, y))).toStrictEqual([
      "before",
      "before",
      "onto",
      "onto",
      "after",
      "after",
    ]);
  });
});

const tabOf = (id: string): Tab => ({ ...tab(id), id });
const solo = (id: string): Group => ({
  id: `g-${id}`,
  layout: { kind: "leaf", paneId: `p-${id}`, tabIds: [id] },
  profileId: "p",
  tabIds: [id],
});

describe(dropAction, () => {
  // a, then b and c split in one group, then d.
  const rows = orderedTabs(
    ["a", "b", "c", "d"].map(tabOf),
    [
      solo("a"),
      {
        id: "g-bc",
        layout: {
          first: { kind: "leaf", paneId: "p-b", tabIds: ["b"] },
          id: "s",
          kind: "split",
          orientation: "vertical",
          ratio: 0.5,
          second: { kind: "leaf", paneId: "p-c", tabIds: ["c"] },
        },
        profileId: "p",
        tabIds: ["b", "c"],
      },
      solo("d"),
    ],
    "p",
    gmail
  );

  it("moves a tab alone to the row it is let go between, and does nothing where it already is", () => {
    expect([
      dropAction(rows, "a", { tabId: "d", zone: "after" }),
      dropAction(rows, "d", { tabId: "a", zone: "before" }),
      dropAction(rows, "d", { tabId: "c", zone: "after" }),
      dropAction(rows, "a", { tabId: "b", zone: "before" }),
    ]).toStrictEqual([
      { kind: "move", to: 2 },
      { kind: "move", to: 0 },
      undefined,
      undefined,
    ]);
  });

  it("takes a tab out of its group to the row it is let go between, even right beside the group or over its own row's edge", () => {
    expect([
      dropAction(rows, "c", { tabId: "a", zone: "before" }),
      dropAction(rows, "c", { tabId: "b", zone: "after" }),
      dropAction(rows, "b", { tabId: "d", zone: "after" }),
      dropAction(rows, "c", { tabId: "c", zone: "after" }),
      dropAction(rows, "a", { tabId: "a", zone: "after" }),
    ]).toStrictEqual([
      { kind: "leave", to: 0 },
      { kind: "leave", to: 2 },
      { kind: "leave", to: 3 },
      { kind: "leave", to: 2 },
      undefined,
    ]);
  });

  it("joins another row's group when let go onto it, and not its own", () => {
    expect([
      dropAction(rows, "a", { tabId: "c", zone: "onto" }),
      dropAction(rows, "b", { tabId: "d", zone: "onto" }),
      dropAction(rows, "b", { tabId: "c", zone: "onto" }),
      dropAction(rows, "a", { tabId: "a", zone: "onto" }),
    ]).toStrictEqual([
      { kind: "join", targetTabId: "c" },
      { kind: "join", targetTabId: "d" },
      undefined,
      undefined,
    ]);
  });
});
