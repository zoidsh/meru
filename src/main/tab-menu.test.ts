import { describe, expect, it } from "vitest";

import { APPS } from "#core/apps.ts";
import type { Overlay } from "#core/overlay.ts";
import { gmailTab, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { TabKey } from "#core/tabs.ts";

import { createTabMenu } from "./tab-menu.ts";

const state: State = {
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
      ],
      selectedTabId: "gmail",
    },
  ],
  selectedProfileId: "p",
};

const key = (each: TabKey) => `${each.profileId}/${each.tabId}`;

const at = (tabId: string) => ({ profileId: "p", tabId, x: 20, y: 80 });

/** The menu over fakes that record what each item reaches, in order. */
const setup = () => {
  const done: unknown[] = [];
  let open: Overlay | undefined;
  const recorded =
    (name: string) =>
    (...args: unknown[]) => {
      done.push([name, ...args]);

      return Promise.resolve(true);
    };

  const menu = createTabMenu({
    state: () => state,
    apps: APPS,
    contentSize: () => ({ width: 800, height: 600 }),
    overlays: {
      open: (next) => {
        open = next;
        done.push(["open", next]);
      },
      close: () => {
        open = undefined;
        done.push(["closed"]);
      },
      current: () => open,
    },
    profiles: {
      setPinned: (each, pinned) => recorded("pinned")(key(each), pinned),
      setOpenAtLaunch: (each, on) => recorded("openAtLaunch")(key(each), on),
      closeTab: (each) => recorded("close")(key(each)),
      closeOtherTabs: (each) => recorded("closeOthers")(key(each)),
      closeTabsBelow: (each) => recorded("closeBelow")(key(each)),
    },
    isLoaded: (each) => each.tabId !== "x",
    reload: (each) => {
      done.push(["reload", key(each)]);
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

  /** Opens the menu on the tab, runs the item and gives what it reached. */
  const choose = async (
    tabId: string,
    item: Parameters<typeof menu.run>[0]
  ) => {
    menu.open(at(tabId));
    done.length = 0;
    await menu.run(item);

    return done;
  };

  return { menu, done, choose };
};

describe(createTabMenu, () => {
  it("opens over a shown tab at a point inside the content area, and refuses any other", () => {
    const { menu, done } = setup();

    menu.open({ ...at("c"), x: 900 });
    menu.open(at("gone"));
    menu.open(at("c"));

    expect(done).toStrictEqual([
      ["log", "Refused a menu for tab p/c at 900,80"],
      ["log", "Refused a menu for tab p/gone at 20,80"],
      ["open", { kind: "tab-menu", ...at("c") }],
    ]);
  });

  it("runs each item on the menu's tab, which need not be selected, and closes the menu", async () => {
    const { choose } = setup();
    const ran = [];

    for (const item of [
      "reload",
      "duplicate",
      "copyUrl",
      "openInBrowser",
      "pin",
      "close",
      "closeOthers",
      "closeBelow",
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one menu at a time
      ran.push([...(await choose("c", item))]);
    }

    expect(ran).toStrictEqual([
      [["reload", "p/c"], ["closed"]],
      [
        ["openTab", "p", "calendar", "https://calendar.google.com/r/week", "c"],
        ["closed"],
      ],
      [["clipboard", "https://calendar.google.com/r/week"], ["closed"]],
      [["browser", "https://calendar.google.com/r/week"], ["closed"]],
      [["pinned", "p/c", true], ["closed"]],
      [["close", "p/c"], ["closed"]],
      [["closeOthers", "p/c"], ["closed"]],
      [["closeBelow", "p/c"], ["closed"]],
    ]);
  });

  it("unpins a pinned tab and switches its Open at Launch", async () => {
    const { choose } = setup();

    expect([
      [...(await choose("gmail", "pin"))],
      [...(await choose("gmail", "openAtLaunch"))],
    ]).toStrictEqual([
      [["pinned", "p/gmail", false], ["closed"]],
      [["openAtLaunch", "p/gmail", false], ["closed"]],
    ]);
  });

  it("refuses what the menu does not offer its tab, such as a page that is not on the web, and still closes", async () => {
    const { choose } = setup();

    expect([
      [...(await choose("gmail", "duplicate"))],
      [...(await choose("x", "reload"))],
      [...(await choose("x", "openInBrowser"))],
    ]).toStrictEqual([
      [
        ["log", "Refused the tab menu's duplicate, which it does not offer"],
        ["closed"],
      ],
      [
        ["log", "Refused the tab menu's reload, which it does not offer"],
        ["closed"],
      ],
      [
        [
          "log",
          "Refused the tab menu's openInBrowser, which it does not offer",
        ],
        ["closed"],
      ],
    ]);
  });

  it("refuses an item with no menu open", async () => {
    const { menu, done } = setup();

    await menu.run("close");

    expect(done).toStrictEqual([
      ["log", "Refused the tab menu's close with no tab menu open"],
    ]);
  });
});
