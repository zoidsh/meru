import { describe, expect, it } from "vitest";

import { APPS } from "./apps.ts";
import { gmailTab, isTab, newProfile } from "./state.ts";
import type { State, Tab } from "./state.ts";
import {
  closeOtherTabs,
  closeTabsBelow,
  duplicatePlace,
  tabMenuAt,
  tabMenuItems,
} from "./tab-menu.ts";

const tab = (id: string, app: string, pinned = false): Tab => ({
  id,
  app,
  url: `https://${app}.google.com/${id}`,
  title: id,
  ...(pinned && { pinned }),
});

/**
 * Gmail, pinned, then the tabs given, in the stored order, which draws
 * pinned ones first.
 */
const state = (tabs: Tab[], selectedTabId = "gmail"): State => ({
  version: 1,
  profiles: [
    {
      ...newProfile("p", "Default"),
      tabs: [gmailTab(), ...tabs],
      selectedTabId,
    },
  ],
  selectedProfileId: "p",
});

const offered = (current: State, tabId: string, loaded = true) =>
  tabMenuItems(current, { profileId: "p", tabId }, APPS, loaded)?.map(
    ({ id, enabled, checked }) =>
      `${id}${enabled ? "" : " off"}${checked === undefined ? "" : ` ${checked ? "on" : "unchecked"}`}`
  );

const ids = (next: State | undefined) => {
  const profile = next?.profiles[0];

  return (
    profile && [
      profile.tabs.filter(isTab).map((each) => each.id),
      profile.selectedTabId,
    ]
  );
};

describe(tabMenuItems, () => {
  it("offers Gmail alone, pinned, no Duplicate, no Close tab and nothing to close beside it", () => {
    expect(offered(state([]), "gmail")).toStrictEqual([
      "sleep",
      "reload",
      "duplicate off",
      "copyUrl",
      "openInBrowser",
      "pin",
      "openAtLaunch on",
      "splitRight",
      "splitDown",
      "separate off",
      "closeOthers off",
      "closeBelow off",
    ]);
  });

  it("offers a listed tab Duplicate and Close tab but no Open at Launch, and Wake in place of Sleep without a page", () => {
    expect(
      offered(state([tab("c", "calendar"), tab("d", "drive")]), "c", false)
    ).toStrictEqual([
      "wake",
      "reload",
      "duplicate",
      "copyUrl",
      "openInBrowser",
      "pin",
      "splitRight",
      "splitDown",
      "separate off",
      "close",
      "closeOthers",
      "closeBelow",
    ]);
  });

  it("offers Separate from split for a tab in the split, and no split beside a tab outside it", () => {
    const split = state([tab("c", "calendar"), tab("d", "drive")]);
    const current: State = {
      ...split,
      profiles: split.profiles.map((profile) => ({
        ...profile,
        split: {
          root: {
            direction: "row",
            children: [
              { size: 0.5, pane: "gmail" },
              { size: 0.5, pane: "c" },
            ],
          },
        },
      })),
    };
    const splitItems = (tabId: string) =>
      offered(current, tabId)?.filter(
        (item) => item.startsWith("split") || item.startsWith("separate")
      );

    expect([splitItems("c"), splitItems("d")]).toStrictEqual([
      ["splitRight", "splitDown", "separate"],
      ["splitRight off", "splitDown off", "separate off"],
    ]);
  });

  it("has nothing below the last tab, and counts below as the sidebar draws, pinned first", () => {
    const current = state([
      tab("c", "calendar"),
      tab("d", "drive", true),
      tab("s", "sheets"),
    ]);

    expect([
      offered(current, "s")?.at(-1),
      offered(current, "d")?.at(-1),
      offered(current, "c")?.at(-1),
    ]).toStrictEqual(["closeBelow off", "closeBelow", "closeBelow"]);
  });

  it("offers Open in default browser only for a page on the web", () => {
    const current = state([
      { ...tab("b", "drive"), url: "about:blank" },
      { ...tab("f", "drive"), url: "file:///etc/hosts" },
      { ...tab("h", "drive"), url: "http://example.com/" },
    ]);

    expect(
      ["b", "f", "h"].map((tabId) =>
        offered(current, tabId)?.find((item) =>
          item.startsWith("openInBrowser")
        )
      )
    ).toStrictEqual([
      "openInBrowser off",
      "openInBrowser off",
      "openInBrowser",
    ]);
  });

  it("offers nothing for a tab that is not shown", () => {
    expect(offered(state([]), "gone")).toBeUndefined();
  });
});

describe(tabMenuAt, () => {
  const size = { width: 800, height: 600 };
  const at = (x: number, y: number, tabId = "gmail") =>
    tabMenuAt(state([]), { profileId: "p", tabId, x, y }, size);

  it("takes a whole point inside the content area for a shown tab", () => {
    expect([at(0, 0), at(800, 600)]).toStrictEqual([
      { profileId: "p", tabId: "gmail", x: 0, y: 0 },
      { profileId: "p", tabId: "gmail", x: 800, y: 600 },
    ]);
  });

  it("refuses a tab of a profile that is not selected", () => {
    const current = state([]);
    const other = { ...newProfile("q", "Work"), tabs: [gmailTab()] };

    expect(
      tabMenuAt(
        { ...current, profiles: [...current.profiles, other] },
        { profileId: "q", tabId: "gmail", x: 10, y: 10 },
        size
      )
    ).toBeUndefined();
  });

  it("refuses a point outside or between pixels, and a tab that is not shown", () => {
    expect([
      at(801, 10),
      at(10, 601),
      at(-1, 10),
      at(1.5, 10),
      at(10, 10, "gone"),
    ]).toStrictEqual([undefined, undefined, undefined, undefined, undefined]);
  });
});

describe(closeOtherTabs, () => {
  it("closes every other tab that can close, keeping the pinned, and selects the tab where the selected one closed", () => {
    const current = state(
      [tab("c", "calendar"), tab("d", "drive", true), tab("s", "sheets")],
      "s"
    );

    expect(
      ids(closeOtherTabs(current, { profileId: "p", tabId: "c" }))
    ).toStrictEqual([["gmail", "c", "d"], "c"]);
  });

  it("keeps the selection where it stays, and changes nothing with nothing to close", () => {
    const current = state([tab("c", "calendar"), tab("s", "sheets")]);

    expect([
      ids(closeOtherTabs(current, { profileId: "p", tabId: "c" })),
      closeOtherTabs(state([]), { profileId: "p", tabId: "gmail" }),
    ]).toStrictEqual([[["gmail", "c"], "gmail"], undefined]);
  });
});

describe(closeTabsBelow, () => {
  it("closes the tabs drawn after it that can close, and selects it where the selected one closed", () => {
    const current = state(
      [
        tab("c", "calendar"),
        tab("d", "drive", true),
        tab("s", "sheets"),
        tab("o", "docs"),
      ],
      "o"
    );

    expect([
      ids(closeTabsBelow(current, { profileId: "p", tabId: "s" })),
      ids(closeTabsBelow(current, { profileId: "p", tabId: "d" })),
      closeTabsBelow(current, { profileId: "p", tabId: "o" }),
    ]).toStrictEqual([
      [["gmail", "c", "d", "s"], "s"],
      [["gmail", "d"], "d"],
      undefined,
    ]);
  });
});

/** A, B, C, then N split beside A: drawn A, N in the box, then B, C. */
const boxed = (): State => {
  const current = state(
    [
      tab("a", "calendar"),
      tab("b", "sheets"),
      tab("c", "slides"),
      tab("n", "drive"),
    ],
    "a"
  );
  const [profile] = current.profiles;

  return {
    ...current,
    profiles: profile
      ? [
          {
            ...profile,
            split: {
              root: {
                direction: "row",
                children: [
                  { size: 0.5, pane: "a" },
                  { size: 0.5, pane: "n" },
                ],
              },
            },
          },
        ]
      : [],
  };
};

describe("Close tabs below with a split's box in the list", () => {
  it("counts as drawn: below B is C alone, and below N are B and C", () => {
    expect([
      ids(closeTabsBelow(boxed(), { profileId: "p", tabId: "b" }))?.[0],
      ids(closeTabsBelow(boxed(), { profileId: "p", tabId: "n" }))?.[0],
      offered(boxed(), "n")?.includes("closeBelow"),
    ]).toStrictEqual([["gmail", "a", "b", "n"], ["gmail", "a", "n"], true]);
  });
});

describe(duplicatePlace, () => {
  it("puts a copy right after its tab, or at the list's end for a pinned one", () => {
    expect([
      duplicatePlace(tab("c", "calendar")),
      duplicatePlace(tab("d", "drive", true)),
    ]).toStrictEqual(["c", undefined]);
  });
});
