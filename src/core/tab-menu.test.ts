import { describe, expect, it } from "vitest";

import { APPS } from "./apps.ts";
import type { MenuEntry } from "./context-menu.ts";
import type { SleepIdleTabs } from "./settings.ts";
import { gmailTab, isTab, newProfile } from "./state.ts";
import type { State, Tab } from "./state.ts";
import {
  closeOtherTabs,
  closeTabsBelow,
  duplicatePlace,
  ownWindowMenu,
  tabMenu,
  tabMenuAt,
} from "./tab-menu.ts";
import type { TabPage } from "./tab-menu.ts";

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

type Entry = MenuEntry<string>;

/** A menu as text: each item's id, " off" while disabled, its check, "|" a line. */
const shown = (menu: readonly Entry[] | undefined) =>
  menu?.map((entry) =>
    entry.kind === "separator"
      ? "|"
      : `${entry.id}${entry.enabled ? "" : " off"}${entry.checked === undefined ? "" : ` ${entry.checked ? "on" : "unchecked"}`}`
  );

const offered = (
  current: State,
  tabId: string,
  page?: TabPage,
  sleepIdleTabs: SleepIdleTabs = "unpinned",
  showWindows = true
) =>
  shown(
    tabMenu(
      current,
      { profileId: "p", tabId },
      APPS,
      page ?? { loaded: true, bookmarked: false },
      sleepIdleTabs,
      showWindows
    )
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

describe(tabMenu, () => {
  it("offers Gmail, pinned, Unpin and Open at Launch, no Duplicate, no Bookmark, no Close tab and nothing to close beside it", () => {
    expect(
      offered(state([]), "gmail", { loaded: true, bookmarked: undefined })
    ).toStrictEqual([
      "sleep",
      "|",
      "reload",
      "duplicate off",
      "copyUrl",
      "openInBrowser",
      "|",
      "unpin",
      "openAtLaunch on",
      "|",
      "splitRight",
      "splitDown",
      "maximize off",
      "separate off",
      "|",
      "moveToNewWindow off",
      "|",
      "closeOthers off",
      "closeBelow off",
    ]);
  });

  it("offers a listed tab Pin, Bookmark tab, Duplicate and Close tab but no Open at Launch, and Wake in place of Sleep without a page", () => {
    expect(
      offered(state([tab("c", "calendar"), tab("d", "drive")]), "c", {
        loaded: false,
        bookmarked: undefined,
      })
    ).toStrictEqual([
      "wake",
      "|",
      "reload",
      "duplicate",
      "copyUrl",
      "openInBrowser",
      "|",
      "pin",
      "|",
      "splitRight",
      "splitDown",
      "maximize off",
      "separate off",
      "|",
      "moveToNewWindow",
      "|",
      "close",
      "closeOthers",
      "closeBelow",
    ]);
  });

  it("offers Sleep When Idle after Sleep or Wake only under Tabs you choose, checked by the tab's mark, never for Gmail's tab or one in its own window", () => {
    const current = state([
      tab("c", "calendar"),
      { ...tab("m", "drive", true), sleepWhenIdle: true },
      { ...tab("w", "docs"), ownWindow: true },
    ]);
    const first = (
      tabId: string,
      sleepIdleTabs: SleepIdleTabs,
      loaded = true
    ) =>
      offered(
        current,
        tabId,
        { loaded, bookmarked: false },
        sleepIdleTabs
      )?.slice(0, 3);

    expect({
      unpinned: first("c", "unpinned"),
      all: first("c", "all"),
      chosen: first("c", "chosen"),
      asleep: first("c", "chosen", false),
      marked: first("m", "chosen"),
      gmail: first("gmail", "chosen"),
      ownWindow: first("w", "chosen"),
    }).toStrictEqual({
      unpinned: ["sleep", "|", "reload"],
      all: ["sleep", "|", "reload"],
      chosen: ["sleep", "sleepWhenIdle unchecked", "|"],
      asleep: ["wake", "sleepWhenIdle unchecked", "|"],
      marked: ["sleep", "sleepWhenIdle on", "|"],
      gmail: ["sleep", "|", "reload"],
      ownWindow: ["reload", "duplicate", "copyUrl"],
    });
  });

  it("offers Bookmark tab for a page not bookmarked, Remove bookmark for one that is, and neither while it cannot be", () => {
    const current = state([tab("c", "calendar")]);
    const bookmarkItems = (bookmarked: boolean | undefined) =>
      offered(current, "c", { loaded: true, bookmarked })?.filter((each) =>
        /bookmark/iu.test(each)
      );

    expect([
      bookmarkItems(false),
      bookmarkItems(true),
      bookmarkItems(undefined),
    ]).toStrictEqual([["bookmark"], ["removeBookmark"], []]);
  });

  it("names each item's command, which an item acting in main alone lacks", () => {
    const commands = Object.fromEntries(
      (
        tabMenu(
          state([tab("c", "calendar")]),
          { profileId: "p", tabId: "c" },
          APPS,
          { loaded: true, bookmarked: false },
          "chosen",
          true
        ) ?? []
      ).flatMap((entry) =>
        entry.kind === "item" ? [[entry.id, entry.command ?? null]] : []
      )
    );

    expect(commands).toStrictEqual({
      sleep: null,
      sleepWhenIdle: null,
      reload: "tab.reload",
      duplicate: null,
      copyUrl: null,
      openInBrowser: null,
      pin: "tab.pin",
      bookmark: "tab.bookmark",
      splitRight: "tab.splitRight",
      splitDown: "tab.splitDown",
      maximize: "tab.maximize",
      separate: "tab.separate",
      moveToNewWindow: "tab.moveToNewWindow",
      close: "tab.close",
      closeOthers: null,
      closeBelow: null,
    });
  });

  it("offers a tab in its own window Move to main window, without Sleep, pinning or splitting", () => {
    const current = state([{ ...tab("c", "calendar"), ownWindow: true }]);

    expect(offered(current, "c")).toStrictEqual([
      "reload",
      "duplicate",
      "copyUrl",
      "openInBrowser",
      "|",
      "pin off",
      "bookmark",
      "|",
      "splitRight off",
      "splitDown off",
      "maximize off",
      "separate off",
      "|",
      "moveToMainWindow",
      "|",
      "close",
      "closeOthers off",
      "closeBelow off",
    ]);
  });

  it("offers Separate from split for a tab in the split, and a new split, without Maximize or Separate, beside a tab outside it", () => {
    const split = state([tab("c", "calendar"), tab("d", "drive")]);
    const current: State = {
      ...split,
      profiles: split.profiles.map((profile) => ({
        ...profile,
        splits: [
          {
            root: {
              direction: "row",
              children: [
                { size: 0.5, pane: "gmail" },
                { size: 0.5, pane: "c" },
              ],
            },
          },
        ],
      })),
    };
    const splitItems = (tabId: string) =>
      offered(current, tabId)?.filter((item) =>
        /^(?:split|separate|maximize|restore)/u.test(item)
      );
    const maximized: State = {
      ...current,
      profiles: current.profiles.map((profile) => ({
        ...profile,
        ...(profile.splits && {
          splits: profile.splits.map((each) => ({ ...each, maximized: true })),
        }),
      })),
    };

    expect([splitItems("c"), splitItems("d")]).toStrictEqual([
      ["splitRight", "splitDown", "maximize", "separate"],
      ["splitRight", "splitDown", "maximize off", "separate off"],
    ]);
    expect(
      offered(maximized, "c")?.filter((item) => item.startsWith("restore"))
    ).toStrictEqual(["restore"]);
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

describe(ownWindowMenu, () => {
  it("offers Move to main window, Copy URL and Open in default browser", () => {
    const current = state([{ ...tab("c", "calendar"), ownWindow: true }]);

    expect(
      shown(ownWindowMenu(current, { profileId: "p", tabId: "c" }))
    ).toStrictEqual(["moveToMainWindow", "copyUrl", "openInBrowser"]);
  });

  it("offers nothing for a tab in the main window or not shown", () => {
    expect([
      ownWindowMenu(state([tab("c", "calendar")]), {
        profileId: "p",
        tabId: "c",
      }),
      ownWindowMenu(state([]), { profileId: "p", tabId: "gone" }),
    ]).toStrictEqual([undefined, undefined]);
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

  it("takes a tab of a profile that is not selected only in its own window", () => {
    const current = state([]);
    const other = {
      ...newProfile("q", "Work"),
      tabs: [gmailTab(), { ...tab("c", "calendar"), ownWindow: true }],
    };
    const both = { ...current, profiles: [...current.profiles, other] };

    expect([
      tabMenuAt(both, { profileId: "q", tabId: "gmail", x: 10, y: 10 }, size),
      tabMenuAt(both, { profileId: "q", tabId: "c", x: 10, y: 10 }, size),
    ]).toStrictEqual([undefined, { profileId: "q", tabId: "c", x: 10, y: 10 }]);
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
      ids(closeOtherTabs(current, { profileId: "p", tabId: "c" }, true))
    ).toStrictEqual([["gmail", "c", "d"], "c"]);
  });

  it("keeps the selection where it stays, and changes nothing with nothing to close", () => {
    const current = state([tab("c", "calendar"), tab("s", "sheets")]);

    expect([
      ids(closeOtherTabs(current, { profileId: "p", tabId: "c" }, true)),
      closeOtherTabs(state([]), { profileId: "p", tabId: "gmail" }, true),
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
      ids(closeTabsBelow(current, { profileId: "p", tabId: "s" }, true)),
      ids(closeTabsBelow(current, { profileId: "p", tabId: "d" }, true)),
      closeTabsBelow(current, { profileId: "p", tabId: "o" }, true),
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
            splits: [
              {
                root: {
                  direction: "row",
                  children: [
                    { size: 0.5, pane: "a" },
                    { size: 0.5, pane: "n" },
                  ],
                },
              },
            ],
          },
        ]
      : [],
  };
};

describe("Close tabs below with a split's box in the list", () => {
  it("counts as drawn: below B is C alone, and below N are B and C", () => {
    expect([
      ids(closeTabsBelow(boxed(), { profileId: "p", tabId: "b" }, true))?.[0],
      ids(closeTabsBelow(boxed(), { profileId: "p", tabId: "n" }, true))?.[0],
      offered(boxed(), "n")?.includes("closeBelow"),
    ]).toStrictEqual([["gmail", "a", "b", "n"], ["gmail", "a", "n"], true]);
  });
});

const pKey = (tabId: string) => ({ profileId: "p", tabId });

/** Calendar and Sheets in windows of their own, Drive and Docs listed. */
const windowed = () =>
  state([
    { ...tab("c", "calendar"), ownWindow: true },
    tab("d", "drive"),
    { ...tab("s", "sheets"), ownWindow: true },
    tab("o", "docs"),
  ]);

describe("Close other tabs and Close tabs below with Show windows in the sidebar", () => {
  it("close every tab beside or below while it is on, own windows too", () => {
    expect([
      ids(closeOtherTabs(windowed(), pKey("d"), true))?.[0],
      ids(closeTabsBelow(windowed(), pKey("d"), true))?.[0],
    ]).toStrictEqual([
      ["gmail", "d"],
      ["gmail", "c", "d"],
    ]);
  });

  it("close only tabs the sidebar lists while it is off, leaving each own window open", () => {
    expect([
      ids(closeOtherTabs(windowed(), pKey("d"), false))?.[0],
      ids(closeTabsBelow(windowed(), pKey("d"), false))?.[0],
    ]).toStrictEqual([
      ["gmail", "c", "d", "s"],
      ["gmail", "c", "d", "s"],
    ]);
  });

  it("are offered by what the sidebar lists: off with only own windows beside or below", () => {
    const current = state([
      tab("d", "drive"),
      { ...tab("c", "calendar"), ownWindow: true },
    ]);
    const closing = (showWindows: boolean, tabId = "d") =>
      offered(current, tabId, undefined, "unpinned", showWindows)?.slice(-2);

    expect([closing(true), closing(false), closing(false, "c")]).toStrictEqual([
      ["closeOthers", "closeBelow"],
      ["closeOthers off", "closeBelow off"],
      ["closeOthers", "closeBelow off"],
    ]);
    expect([
      closeOtherTabs(current, pKey("d"), false),
      closeTabsBelow(current, pKey("d"), false),
      closeTabsBelow(current, pKey("c"), false),
    ]).toStrictEqual([undefined, undefined, undefined]);
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
