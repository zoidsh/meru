import { describe, expect, it } from "vitest";

import { APPS, findApp } from "./apps.ts";
import type { App } from "./apps.ts";
import {
  decodeState,
  gmailTab,
  isAsleep,
  isTab,
  newProfile,
  sleepProfile,
} from "./state.ts";
import type { State, Tab } from "./state.ts";
import {
  adjacentTab,
  closeTab,
  moveTab,
  moveToMainWindow,
  moveToOwnWindow,
  openTab,
  selectTab,
  setOpenAtLaunch,
  setOwnWindowBounds,
  setPinned,
  setSleepWhenIdle,
  splitTab,
  startsInOwnWindow,
  updatePages,
} from "./tabs.ts";

const app = (id: string) => findApp(APPS, id) as App;

const tab = (id: string, appId: string): Tab => ({
  id,
  app: appId,
  url: `https://${appId}.google.com/${id}`,
  title: id,
});

const state = (tabs: Tab[], selectedTabId = "gmail"): State => ({
  version: 1,
  profiles: [
    {
      ...newProfile("p", "Default"),
      tabs: [gmailTab(), ...tabs],
      selectedTabId,
    },
    newProfile("q", "Profile 2"),
  ],
  selectedProfileId: "p",
});

/** The profile, with every tab that parsed. */
const tabsOf = (next: State | undefined, profileId = "p") => {
  const profile = next?.profiles.find(
    (candidate) => candidate.id === profileId
  );

  return profile && { ...profile, tabs: profile.tabs.filter(isTab) };
};

const ids = (next: State | undefined) => {
  const profile = tabsOf(next);

  return (
    profile && [profile.tabs.map((each) => each.id), profile.selectedTabId]
  );
};

/** Opens a second Calendar after the tab named. */
const openedAfter = (name: string) =>
  ids(
    openTab(
      state([tab("c1", "calendar"), tab("d1", "drive")]),
      "p",
      app("calendar"),
      "https://calendar.google.com/2",
      () => "c2",
      name
    )?.state
  );

describe(startsInOwnWindow, () => {
  it("sends a new tab to a window of its own only under New window, for any app but Gmail, neither pinned nor asked for as a split", () => {
    const table = [
      ["calendar", false, false, "windows", true],
      ["drive", false, false, "windows", true],
      ["calendar", false, false, "tabs", false],
      ["gmail", false, false, "windows", false],
      ["calendar", true, false, "windows", false],
      ["calendar", false, true, "windows", false],
    ] as const;

    expect(
      table.map(([appId, pinned, split, openAppsIn]) =>
        startsInOwnWindow({ app: app(appId), pinned, split, openAppsIn })
      )
    ).toStrictEqual(table.map((row) => row[4]));
  });
});

/** Opens a tab of the app beside Calendar, selected, as Open Google apps in says. */
const openedBeside = (
  appId: string,
  openAppsIn: "tabs" | "windows",
  options: { split?: "row"; tabs?: Tab[]; singleInstance?: boolean } = {}
) =>
  openTab(
    state(options.tabs ?? [tab("c1", "calendar")], "c1"),
    "p",
    { ...app(appId), ...(options.singleInstance && { singleInstance: true }) },
    `https://${appId}.google.com/new`,
    () => "new",
    undefined,
    options.split,
    openAppsIn
  );

describe("openTab under New window", () => {
  it("puts a new tab in a window of its own after the others, the main window's selection kept, and says so", () => {
    const next = openedBeside("drive", "windows");

    expect([
      next?.ownWindow,
      ids(next?.state),
      tabsOf(next?.state)?.tabs[2]?.ownWindow,
    ]).toStrictEqual([true, [["gmail", "c1", "new"], "c1"], true]);
  });

  it("opens it in the main window, selected, under Tabs", () => {
    const next = openedBeside("drive", "tabs");

    expect([next?.ownWindow, ids(next?.state)]).toStrictEqual([
      undefined,
      [["gmail", "c1", "new"], "new"],
    ]);
    expect(tabsOf(next?.state)?.tabs[2]).not.toHaveProperty("ownWindow");
  });

  it("keeps Gmail, opened again after it was closed, in the main window", () => {
    const next = openTab(
      {
        ...state([tab("c1", "calendar")], "c1"),
        profiles: [
          { ...newProfile("p", "Default"), tabs: [tab("c1", "calendar")] },
        ],
      },
      "p",
      app("gmail"),
      "https://mail.google.com/",
      () => "new",
      undefined,
      undefined,
      "windows"
    );

    expect([next?.ownWindow, ids(next?.state)]).toStrictEqual([
      undefined,
      [["c1", "gmail"], "gmail"],
    ]);
  });

  it("keeps an Open in split a split in the main window", () => {
    const next = openedBeside("drive", "windows", { split: "row" });

    expect(next?.ownWindow).toBeUndefined();
    expect(ids(next?.state)?.[1]).toBe("new");
    expect(tabsOf(next?.state)?.splits).toHaveLength(1);
  });

  it("sends the URL to a single-instance app's existing tab wherever it is, opening no window", () => {
    const next = openedBeside("drive", "windows", {
      tabs: [tab("c1", "calendar"), tab("d1", "drive")],
      singleInstance: true,
    });

    expect([next?.tabId, next?.ownWindow, ids(next?.state)]).toStrictEqual([
      "d1",
      undefined,
      [["gmail", "c1", "d1"], "d1"],
    ]);
    expect(tabsOf(next?.state)?.tabs[2]).not.toHaveProperty("ownWindow");
  });
});

describe(openTab, () => {
  it("appends a tab of the app at the URL, selected, in that profile only", () => {
    const opened = openTab(
      state([]),
      "p",
      app("calendar"),
      "https://calendar.google.com/r",
      () => "new"
    );

    expect(opened?.tabId).toBe("new");
    expect(ids(opened?.state)).toStrictEqual([["gmail", "new"], "new"]);
    expect(tabsOf(opened?.state)?.tabs[1]).toStrictEqual({
      id: "new",
      app: "calendar",
      url: "https://calendar.google.com/r",
      title: "",
    });
    expect(tabsOf(opened?.state, "q")?.tabs).toHaveLength(1);
  });

  it("puts the new tab right after the one named, or last where none is", () => {
    expect([openedAfter("c1"), openedAfter("gone")]).toStrictEqual([
      [["gmail", "c1", "c2", "d1"], "c2"],
      [["gmail", "c1", "d1", "c2"], "c2"],
    ]);
  });

  it("opens a second tab of an app that may have more than one", () => {
    const opened = openTab(
      state([tab("c1", "calendar")]),
      "p",
      app("calendar"),
      "https://calendar.google.com/2",
      () => "c2"
    );

    expect(ids(opened?.state)).toStrictEqual([["gmail", "c1", "c2"], "c2"]);
  });

  it("selects and sends a single-instance app's tab to the URL rather than opening another", () => {
    const opened = openTab(
      state([tab("c1", "calendar")], "c1"),
      "p",
      app("gmail"),
      "https://mail.google.com/mail/u/0/#inbox/abc",
      () => "never"
    );

    expect(opened?.tabId).toBe("gmail");
    expect(ids(opened?.state)).toStrictEqual([["gmail", "c1"], "gmail"]);
    expect(tabsOf(opened?.state)?.tabs[0]?.url).toBe(
      "https://mail.google.com/mail/u/0/#inbox/abc"
    );
  });

  it("opens Gmail where it was closed under its own id, unpinned, the key written so it is not read as a Gmail tab from before pinning", () => {
    const closed = {
      ...state([]),
      profiles: [
        { ...newProfile("p", "Default"), tabs: [], selectedTabId: "" },
      ],
    };
    const opened = openTab(
      closed,
      "p",
      app("gmail"),
      "https://mail.google.com/mail/u/0",
      () => "never"
    );

    expect([opened?.tabId, tabsOf(opened?.state)?.tabs]).toStrictEqual([
      "gmail",
      [
        {
          id: "gmail",
          app: "gmail",
          url: "https://mail.google.com/mail/u/0",
          title: "",
          pinned: false,
        },
      ],
    ]);
  });

  it("opens nothing in a profile that is not listed", () => {
    expect(
      openTab(
        state([]),
        "gone",
        app("drive"),
        "https://drive.google.com/",
        () => "x"
      )
    ).toBeUndefined();
  });
});

describe(selectTab, () => {
  it("selects a shown tab, and changes nothing for the selected one, a missing one or one not shown", () => {
    const three = state([tab("c1", "calendar"), tab("t9", "tasks")]);

    expect(
      ids(selectTab(three, { profileId: "p", tabId: "c1" }))
    ).toStrictEqual([["gmail", "c1", "t9"], "c1"]);
    expect(
      selectTab(three, { profileId: "p", tabId: "gmail" })
    ).toBeUndefined();
    expect(selectTab(three, { profileId: "p", tabId: "gone" })).toBeUndefined();
    expect(selectTab(three, { profileId: "p", tabId: "t9" })).toBeUndefined();
  });
});

const three = (selected: string) =>
  state([tab("c1", "calendar"), tab("d1", "drive")], selected);

describe(closeTab, () => {
  it("never closes a pinned tab, and closes Gmail's once it is unpinned", () => {
    const gmail = { profileId: "p", tabId: "gmail" };

    expect([
      closeTab(three("gmail"), gmail),
      ids(closeTab(setPinned(three("gmail"), gmail, false) as State, gmail)),
    ]).toStrictEqual([undefined, [["c1", "d1"], "c1"]]);
  });

  it("leaves no tab selected when it closes the only one", () => {
    const only = {
      ...state([], "c1"),
      profiles: [
        {
          ...newProfile("p", "Default"),
          tabs: [tab("c1", "calendar")],
          selectedTabId: "c1",
        },
      ],
    };

    expect(ids(closeTab(only, { profileId: "p", tabId: "c1" }))).toStrictEqual([
      [],
      "",
    ]);
  });

  it("selects the tab to the right of the selected one it closes, or to the left when it was last", () => {
    expect(
      ids(closeTab(three("c1"), { profileId: "p", tabId: "c1" }))
    ).toStrictEqual([["gmail", "d1"], "d1"]);
    expect(
      ids(closeTab(three("d1"), { profileId: "p", tabId: "d1" }))
    ).toStrictEqual([["gmail", "c1"], "c1"]);
  });

  it("leaves the selection alone when another tab closes", () => {
    expect(
      ids(closeTab(three("d1"), { profileId: "p", tabId: "c1" }))
    ).toStrictEqual([["gmail", "d1"], "d1"]);
  });

  it("skips a tab that is not shown when choosing the next", () => {
    const hidden = state([tab("c1", "calendar"), tab("t9", "tasks")], "c1");

    expect(
      ids(closeTab(hidden, { profileId: "p", tabId: "c1" }))
    ).toStrictEqual([["gmail", "t9"], "gmail"]);
  });
});

describe(setPinned, () => {
  it("pins and unpins a shown tab, leaving its Open at Launch as it is", () => {
    const key = { profileId: "p", tabId: "c1" };
    const pinned = setPinned(
      state([{ ...tab("c1", "calendar"), openAtLaunch: true }]),
      key,
      true
    );
    const unpinned = pinned && setPinned(pinned, key, false);

    expect(
      [pinned, unpinned].map((next) =>
        tabsOf(next)?.tabs.find((candidate) => candidate.id === "c1")
      )
    ).toStrictEqual([
      { ...tab("c1", "calendar"), openAtLaunch: true, pinned: true },
      { ...tab("c1", "calendar"), openAtLaunch: true, pinned: false },
    ]);
  });

  it("changes nothing for a tab that already reads so or is not shown", () => {
    const before = state([tab("c1", "calendar"), tab("t9", "tasks")]);

    expect([
      setPinned(before, { profileId: "p", tabId: "gmail" }, true),
      setPinned(before, { profileId: "p", tabId: "c1" }, false),
      setPinned(before, { profileId: "p", tabId: "t9" }, true),
    ]).toStrictEqual([undefined, undefined, undefined]);
  });
});

describe(moveTab, () => {
  // Gmail and Drive pinned, Calendar, Docs and Sheets listed, with an entry
  // that does not parse after Calendar and a Tasks tab of an app this build
  // does not know after Docs, neither shown.
  const decoded = decodeState({
    version: 1,
    profiles: [
      {
        id: "p",
        name: "Default",
        tabs: [
          gmailTab(),
          tab("c", "calendar"),
          { id: 7 },
          { ...tab("d", "drive"), pinned: true },
          tab("o", "docs"),
          tab("t", "tasks"),
          tab("s", "sheets"),
        ],
        selectedTabId: "gmail",
      },
      { id: "q", name: "Work", tabs: [gmailTab()], selectedTabId: "gmail" },
    ],
    selectedProfileId: "p",
  });
  const before = decoded.kind === "read" ? decoded.value : state([]);

  /** Every entry's id after the move, `?` for the one that does not parse. */
  const moved = (tabId: string, target?: string, profileId = "p") => {
    const next = moveTab(before, { profileId, tabId }, target);

    return next?.profiles[0]?.tabs.map((entry) =>
      isTab(entry) ? entry.id : "?"
    );
  };

  it("moves a listed tab up, down and to either end of the list", () => {
    expect([
      moved("o", "c"),
      moved("c", "s"),
      moved("s", "c"),
      moved("c"),
    ]).toStrictEqual([
      ["gmail", "o", "c", "?", "d", "t", "s"],
      ["gmail", "?", "d", "o", "t", "c", "s"],
      ["gmail", "s", "c", "?", "d", "o", "t"],
      ["gmail", "?", "d", "o", "t", "s", "c"],
    ]);
  });

  it("moves a pinned tab within the pinned area", () => {
    expect([moved("d", "gmail"), moved("gmail")]).toStrictEqual([
      ["d", "gmail", "c", "?", "o", "t", "s"],
      ["c", "?", "d", "gmail", "o", "t", "s"],
    ]);
  });

  it("refuses a move across areas, onto itself, to its own place, of a tab not shown or of a profile not selected", () => {
    expect([
      moved("c", "d"),
      moved("d", "c"),
      moved("c", "c"),
      moved("c", "o"),
      moved("s"),
      moved("t", "c"),
      moved("c", "t"),
      moved("gone", "c"),
      moved("gmail", undefined, "q"),
    ]).toStrictEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe(setOpenAtLaunch, () => {
  it("switches a pinned tab's Open at Launch, and nothing for a tab that is not pinned", () => {
    const before = state([tab("c1", "calendar")]);
    const off = setOpenAtLaunch(
      before,
      { profileId: "p", tabId: "gmail" },
      false
    );

    expect([
      tabsOf(off)?.tabs[0],
      setOpenAtLaunch(before, { profileId: "p", tabId: "gmail" }, true),
      setOpenAtLaunch(before, { profileId: "p", tabId: "c1" }, true),
    ]).toStrictEqual([
      { ...gmailTab(), openAtLaunch: false },
      undefined,
      undefined,
    ]);
  });
});

describe(setSleepWhenIdle, () => {
  it("marks any tab, pinned or not, takes the mark away leaving no key, and keeps it through a move to its own window and back", () => {
    const before = state([tab("c1", "calendar")]);
    const c1 = { profileId: "p", tabId: "c1" };
    const marked = setSleepWhenIdle(before, c1, true);
    const moved =
      marked &&
      moveToMainWindow(moveToOwnWindow(marked, c1) ?? marked, c1, true);

    expect([
      tabsOf(setSleepWhenIdle(before, { profileId: "p", tabId: "gmail" }, true))
        ?.tabs[0],
      tabsOf(marked)?.tabs[1],
      tabsOf(moved)?.tabs[1]?.sleepWhenIdle,
      marked && tabsOf(setSleepWhenIdle(marked, c1, false))?.tabs[1],
      setSleepWhenIdle(before, c1, false),
      marked && setSleepWhenIdle(marked, c1, true),
    ]).toStrictEqual([
      { ...gmailTab(), sleepWhenIdle: true },
      { ...tab("c1", "calendar"), sleepWhenIdle: true },
      true,
      tab("c1", "calendar"),
      undefined,
      undefined,
    ]);
  });
});

describe(updatePages, () => {
  it("keeps each tab's latest URL and title, and nothing when none of it is news", () => {
    const before = state([tab("c1", "calendar")]);
    const next = updatePages(before, [
      { profileId: "p", tabId: "c1", url: "https://calendar.google.com/week" },
      { profileId: "p", tabId: "gmail", title: "Inbox (2)" },
      { profileId: "p", tabId: "gone", title: "Nobody" },
    ]);

    expect(
      tabsOf(next)?.tabs.map(({ url, title }) => [url, title])
    ).toStrictEqual([
      ["https://mail.google.com/mail/u/0", "Inbox (2)"],
      ["https://calendar.google.com/week", "c1"],
    ]);
    expect(
      updatePages(before, [{ profileId: "p", tabId: "c1", title: "c1" }])
    ).toBeUndefined();
    expect(updatePages(before, [])).toBeUndefined();
  });
});

describe(adjacentTab, () => {
  it("is the next or previous shown tab of the selected profile, wrapping round", () => {
    expect(adjacentTab(three("gmail"), 1)).toStrictEqual({
      profileId: "p",
      tabId: "c1",
    });
    expect(adjacentTab(three("d1"), 1)?.tabId).toBe("gmail");
    expect(adjacentTab(three("gmail"), -1)?.tabId).toBe("d1");
    expect(adjacentTab(three("c1"), -1)?.tabId).toBe("gmail");
  });

  it("goes in the order the sidebar draws, a split's box where its first tab stands", () => {
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
    const boxed: State = {
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

    expect([
      adjacentTab(boxed, 1)?.tabId,
      adjacentTab(
        {
          ...boxed,
          profiles: boxed.profiles.map((each) => ({
            ...each,
            selectedTabId: "b",
          })),
        },
        -1
      )?.tabId,
    ]).toStrictEqual(["n", "n"]);
  });

  it("skips a tab of an app this build does not know", () => {
    expect(
      adjacentTab(state([tab("x1", "later"), tab("c1", "calendar")]), 1)?.tabId
    ).toBe("c1");
  });

  it("is nothing when Gmail's is the only tab", () => {
    expect(adjacentTab(state([]), 1)).toBeUndefined();
  });
});

describe("a sleeping profile's tabs", () => {
  const asleep: State = {
    version: 1,
    profiles: [
      {
        ...newProfile("a", "Default"),
        tabs: [gmailTab(), { id: "c", app: "calendar", url: "", title: "" }],
      },
      newProfile("b", "Work"),
    ],
    selectedProfileId: "b",
  };
  const slept = sleepProfile(asleep, "a") ?? asleep;
  const calendar = findApp(APPS, "calendar") as App;

  it("leave it asleep when one is selected, a page opens in it or one closes, since only selecting the profile wakes it", () => {
    expect(
      [
        selectTab(slept, { profileId: "a", tabId: "c" }),
        openTab(slept, "a", calendar, calendar.home, () => "new")?.state,
        closeTab(slept, { profileId: "a", tabId: "c" }),
      ].map(
        (next) => next && isAsleep(next, next.profiles[0] ?? newProfile("", ""))
      )
    ).toStrictEqual([true, true, true]);
  });
});

const key = (tabId: string, profileId = "p") => ({ profileId, tabId });

/** The profile's tabs in windows of their own, and its selected tab. */
const moved = (next: State | undefined, profileId = "p") => {
  const profile = tabsOf(next, profileId);

  return (
    profile && [
      profile.tabs
        .filter((each) => each.ownWindow === true)
        .map((each) => each.id),
      profile.selectedTabId,
    ]
  );
};

const out = (current: State, tabId: string) =>
  moveToOwnWindow(current, key(tabId)) as State;

describe(moveToOwnWindow, () => {
  it("moves the selected tab out and selects the one closing it would", () => {
    expect([
      moved(moveToOwnWindow(three("c1"), key("c1"))),
      moved(moveToOwnWindow(three("d1"), key("d1"))),
    ]).toStrictEqual([
      [["c1"], "d1"],
      [["d1"], "c1"],
    ]);
  });

  it("leaves the selection alone when another tab moves", () => {
    expect(moved(moveToOwnWindow(three("d1"), key("c1")))).toStrictEqual([
      ["c1"],
      "d1",
    ]);
  });

  it("passes over a tab already in its own window when choosing the next", () => {
    expect(
      moved(moveToOwnWindow(out(three("c1"), "d1"), key("c1")))
    ).toStrictEqual([["c1", "d1"], "gmail"]);
  });

  it("refuses a pinned tab, one already moved and one that is missing", () => {
    const once = out(three("gmail"), "c1");

    expect([
      moveToOwnWindow(three("gmail"), key("gmail")),
      moveToOwnWindow(once, key("c1")),
      moveToOwnWindow(once, key("gone")),
    ]).toStrictEqual([undefined, undefined, undefined]);
  });

  it("takes a tab out of its split first", () => {
    const current = state([tab("c1", "calendar"), tab("d1", "drive")], "c1");
    const split = splitTab(current, key("d1"), "row") as State;
    const next = moveToOwnWindow(split, key("d1"));

    expect([
      tabsOf(split)?.splits?.length,
      tabsOf(next)?.splits ?? [],
      moved(next),
    ]).toStrictEqual([1, [], [["d1"], "c1"]]);
  });
});

describe(moveToMainWindow, () => {
  it("puts the tab back where it stood, unselected, keeping where its window was", () => {
    const bounds = { x: 10, y: 20, width: 800, height: 600 };
    const away = setOwnWindowBounds(
      out(three("c1"), "c1"),
      key("c1"),
      bounds
    ) as State;
    const back = moveToMainWindow(away, key("c1"), false);

    expect([
      ids(back),
      moved(back),
      tabsOf(back)?.tabs.find((each) => each.id === "c1")?.windowBounds,
    ]).toStrictEqual([[["gmail", "c1", "d1"], "d1"], [[], "d1"], bounds]);
  });

  it("with select selects the tab and its profile", () => {
    const away = { ...out(three("c1"), "c1"), selectedProfileId: "q" };
    const back = moveToMainWindow(away, key("c1"), true);

    expect([moved(back), back?.selectedProfileId]).toStrictEqual([
      [[], "c1"],
      "p",
    ]);
  });

  it("is nothing for a tab in the main window", () => {
    expect(moveToMainWindow(three("c1"), key("c1"), true)).toBeUndefined();
  });
});

describe(setOwnWindowBounds, () => {
  it("is nothing when the bounds are those kept", () => {
    const bounds = { x: 0, y: 0, width: 500, height: 400 };
    const kept = setOwnWindowBounds(three("c1"), key("c1"), bounds) as State;

    expect(setOwnWindowBounds(kept, key("c1"), { ...bounds })).toBeUndefined();
  });
});

describe("a tab in its own window", () => {
  const away = out(three("gmail"), "c1");

  it("is never selected in the main window, and Open on its app's URL keeps the selection", () => {
    const unpinned = setPinned(three("c1"), key("gmail"), false) as State;
    const reopened = openTab(
      out(unpinned, "gmail"),
      "p",
      app("gmail"),
      "https://mail.google.com/mail/u/0#sent",
      () => "g2"
    )?.state;

    expect([
      selectTab(away, key("c1")),
      tabsOf(reopened)?.selectedTabId,
      tabsOf(reopened)?.tabs.map((each) => each.id),
    ]).toStrictEqual([undefined, "c1", ["gmail", "c1", "d1"]]);
  });

  it("is passed over by the next and previous tab and by closing the selected one", () => {
    expect([
      adjacentTab(away, 1)?.tabId,
      adjacentTab(away, -1)?.tabId,
      ids(closeTab(out(three("d1"), "c1"), key("d1"))),
    ]).toStrictEqual(["d1", "d1", [["gmail", "c1"], "gmail"]]);
  });

  it("goes into no split", () => {
    expect(splitTab(away, key("c1"), "row")).toBeUndefined();
  });

  it("is back in the main window when its profile sleeps, its window's place kept", () => {
    const bounds = { x: 1, y: 2, width: 600, height: 500 };
    const placed = setOwnWindowBounds(away, key("c1"), bounds) as State;
    const slept = sleepProfile(placed, "p");

    expect([
      moved(slept),
      tabsOf(slept)?.tabs.find((each) => each.id === "c1")?.windowBounds,
    ]).toStrictEqual([[[], "gmail"], bounds]);
  });
});
