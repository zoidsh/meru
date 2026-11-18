import { describe, expect, it } from "vitest";

import { APPS } from "#core/apps.ts";
import { gmailTab, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { TabKey } from "#core/tabs.ts";
import type { ContextMenuItem, MenuPoint } from "#platform/context-menu.ts";

import { createTabMenu } from "./tab-menu.ts";

const initial: State = {
  version: 1,
  profiles: [
    {
      ...newProfile("p", "Default"),
      tabs: [
        gmailTab(),
        {
          id: "c",
          app: "calendar",
          url: "https://calendar.google.com/r/week",
          title: "Week",
        },
        { id: "x", app: "drive", url: "about:blank", title: "Blank" },
        {
          id: "w",
          app: "docs",
          url: "https://docs.google.com/document/d/1",
          title: "Notes",
          ownWindow: true,
        },
      ],
      selectedTabId: "gmail",
    },
  ],
  selectedProfileId: "p",
};

const key = (each: TabKey) => `${each.profileId}/${each.tabId}`;

const at = (tabId: string) => ({ profileId: "p", tabId, x: 20, y: 80 });

interface Popup {
  window: string;
  items: readonly ContextMenuItem[];
  at: MenuPoint | undefined;
}

/** A window that records each menu popped up in it. */
const menuWindow = (name: string, popups: Popup[]) => ({
  getContentAreaSize: () => ({ width: 800, height: 600 }),
  showContextMenu: (items: readonly ContextMenuItem[], point?: MenuPoint) => {
    popups.push({ window: name, items, at: point });
  },
});

const CHECKS = { true: " [x]", false: " [ ]", undefined: "" } as const;

/** The labels of a popup, "—" a line, "(off)" a disabled item, "[x]" a checked one. */
const labels = (popup: Popup | undefined) =>
  popup?.items.map((item) =>
    "type" in item
      ? "—"
      : `${item.label}${item.enabled ? "" : " (off)"}${CHECKS[`${item.checked}`]}${item.accelerator ? ` ${item.accelerator}` : ""}`
  );

/** The menus over fakes that record what each item reaches, in order. */
const setup = ({ state = initial, bookmarked = false } = {}) => {
  const done: unknown[] = [];
  const popups: Popup[] = [];
  const recorded =
    (name: string) =>
    (...args: unknown[]) => {
      done.push([name, ...args]);

      return Promise.resolve(true);
    };
  let current = state;

  const menu = createTabMenu({
    state: () => current,
    apps: APPS,
    window: menuWindow("main", popups),
    ownWindow: (each) =>
      each.tabId === "w" ? menuWindow("own", popups) : undefined,
    accelerator: (command) =>
      ({
        "tab.close": "CommandOrControl+W",
        "tab.reload": "CommandOrControl+R",
      })[command],
    bookmarks: {
      bookmarked: (each) => (each.tabId === "gmail" ? undefined : bookmarked),
      toggle: async (each, announce) => {
        await recorded("bookmark")(key(each), announce);
      },
    },
    profiles: {
      setPinned: (each, pinned) => recorded("pinned")(key(each), pinned),
      setOpenAtLaunch: (each, on) => recorded("openAtLaunch")(key(each), on),
      closeTab: (each) => recorded("close")(key(each)),
      closeOtherTabs: (each) => recorded("closeOthers")(key(each)),
      closeTabsBelow: (each) => recorded("closeBelow")(key(each)),
      separateTab: (each) => recorded("separate")(key(each)),
      maximizePane: (each, on) => recorded("maximize")(key(each), on),
    },
    moveToOwnWindow: (each) => recorded("moveToOwnWindow")(key(each)),
    moveToMainWindow: (each) => recorded("moveToMainWindow")(key(each)),
    isLoaded: (each) => each.tabId !== "x",
    reload: (each) => recorded("reload")(key(each)),
    sleep: (each) => {
      done.push(["sleep", key(each)]);
    },
    wake: (each) => recorded("wake")(key(each)),
    openSplit: (direction) => {
      done.push(["openSplit", direction]);
    },
    openTab: (profileId, app, url, after) =>
      recorded("openTab")(profileId, app.id, url, after),
    clipboard: {
      writeText: async (text) => {
        await recorded("clipboard")(text);
      },
    },
    systemBrowser: {
      open: async (url) => {
        await recorded("browser")(url);
      },
    },
    log: (message) => done.push(["log", message]),
  });

  /** Clicks the item labelled so in the last popup, and gives what it reached. */
  const click = async (label: string) => {
    const item = popups
      .at(-1)
      ?.items.find(
        (candidate) => !("type" in candidate) && candidate.label === label
      );

    done.length = 0;

    if (item && !("type" in item)) {
      await item.click?.();
    }

    return [...done];
  };

  /** Opens the tab's menu, chooses the item and gives what it reached. */
  const choose = (tabId: string, label: string) => {
    menu.open(at(tabId));

    return click(label);
  };

  const setState = (next: State) => {
    current = next;
  };

  return { menu, done, popups, click, choose, setState };
};

describe(createTabMenu, () => {
  it("pops up a shown tab's menu in the main window at the point asked for, and refuses any other", () => {
    const { menu, done, popups } = setup();

    menu.open({ ...at("c"), x: 900 });
    menu.open(at("gone"));
    menu.open(at("c"));

    expect(done).toStrictEqual([
      ["log", "Refused a menu for tab p/c at 900,80"],
      ["log", "Refused a menu for tab p/gone at 20,80"],
    ]);
    expect(
      popups.map(({ window, at: point }) => [window, point])
    ).toStrictEqual([["main", { x: 20, y: 80 }]]);
    expect(labels(popups[0])).toStrictEqual([
      "Sleep",
      "—",
      "Reload CommandOrControl+R",
      "Duplicate",
      "Copy URL",
      "Open in default browser",
      "—",
      "Pin",
      "Bookmark tab",
      "—",
      "Split right",
      "Split down",
      "Maximize pane (off)",
      "Separate from split (off)",
      "—",
      "Move to new window",
      "—",
      "Close tab CommandOrControl+W",
      "Close other tabs",
      "Close tabs below",
    ]);
  });

  it("names Gmail's items Unpin and Open at Launch, checked, with no bookmark item", () => {
    const { menu, popups } = setup();

    menu.open(at("gmail"));

    expect(labels(popups[0])?.slice(6, 9)).toStrictEqual([
      "—",
      "Unpin",
      "Open at Launch [x]",
    ]);
    expect(labels(popups[0])).not.toContain("Bookmark tab");
  });

  it("runs each item on the menu's tab, which need not be selected", async () => {
    const { choose } = setup();
    const ran = [];

    for (const label of [
      "Sleep",
      "Reload",
      "Duplicate",
      "Copy URL",
      "Open in default browser",
      "Pin",
      "Bookmark tab",
      "Split right",
      "Move to new window",
      "Close tab",
      "Close other tabs",
      "Close tabs below",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one menu at a time
      ran.push(await choose("c", label));
    }

    expect(ran).toStrictEqual([
      [["sleep", "p/c"]],
      [["reload", "p/c"]],
      [["openTab", "p", "calendar", "https://calendar.google.com/r/week", "c"]],
      [["clipboard", "https://calendar.google.com/r/week"]],
      [["browser", "https://calendar.google.com/r/week"]],
      [["pinned", "p/c", true]],
      [["bookmark", "p/c", true]],
      [
        ["wake", "p/c"],
        ["openSplit", "row"],
      ],
      [["moveToOwnWindow", "p/c"]],
      [["close", "p/c"]],
      [["closeOthers", "p/c"]],
      [["closeBelow", "p/c"]],
    ]);
  });

  it("unpins a pinned tab, switches its Open at Launch, and removes a bookmark", async () => {
    const { choose } = setup({ bookmarked: true });

    expect([
      await choose("gmail", "Unpin"),
      await choose("gmail", "Open at Launch"),
      await choose("c", "Remove bookmark"),
    ]).toStrictEqual([
      [["pinned", "p/gmail", false]],
      [["openAtLaunch", "p/gmail", false]],
      [["bookmark", "p/c", true]],
    ]);
  });

  it("wakes a tab with no page, and reloads it, waking it too", async () => {
    const { choose } = setup();

    expect([
      await choose("x", "Wake"),
      await choose("x", "Reload"),
    ]).toStrictEqual([[["wake", "p/x"]], [["reload", "p/x"]]]);
  });

  it("refuses an item the menu no longer offers once it is chosen", async () => {
    const { menu, click, setState } = setup();

    menu.open(at("c"));
    setState({
      ...initial,
      profiles: initial.profiles.map((profile) => ({
        ...profile,
        tabs: profile.tabs.filter((each) => !("id" in each) || each.id !== "c"),
      })),
    });

    await expect(click("Close tab")).resolves.toStrictEqual([
      ["log", "Refused the tab menu's close, which it does not offer"],
    ]);
  });

  it("pops up More options in the tab's own window, and moves it back to the main window", async () => {
    const { menu, popups, click } = setup();

    menu.openOwnWindow({ ...at("w"), x: 760, y: 40 });

    expect([popups[0]?.window, popups[0]?.at, labels(popups[0])]).toStrictEqual(
      [
        "own",
        { x: 760, y: 40 },
        [
          "Move to main window",
          "Open at Launch (off) [ ]",
          "Copy URL",
          "Open in default browser",
        ],
      ]
    );
    expect([
      await click("Copy URL"),
      await click("Move to main window"),
    ]).toStrictEqual([
      [["clipboard", "https://docs.google.com/document/d/1"]],
      [["moveToMainWindow", "p/w"]],
    ]);
  });

  it("refuses More options for a tab with no own window open, or a point outside it", () => {
    const { menu, done, popups } = setup();

    menu.openOwnWindow(at("c"));
    menu.openOwnWindow({ ...at("w"), y: 601 });

    expect([popups, done]).toStrictEqual([
      [],
      [
        ["log", "Refused a menu for tab p/c at 20,80"],
        ["log", "Refused a menu for tab p/w at 20,601"],
      ],
    ]);
  });
});
