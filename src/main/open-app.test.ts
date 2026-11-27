import { describe, expect, it } from "vitest";

import { APPS } from "#core/apps.ts";
import { bookmarks } from "#core/bookmarks.ts";
import { silentLog } from "#core/log.fake.ts";
import type { Overlay } from "#core/overlay.ts";
import { gmailTab, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { Size } from "#core/window-bounds.ts";

import { createOpenApp } from "./open-app.ts";

const two: State = {
  version: 1,
  profiles: [newProfile("a", "Default"), newProfile("b", "Work")],
  selectedProfileId: "b",
};

const setup = (
  initial?: Overlay,
  start: State = two,
  pageSize?: Size,
  pages: Partial<Record<string, string>> = {},
  /**
   * The apps Tabs & Google Apps sends to the default browser, for every
   * profile or by profile.
   */
  inBrowser: readonly string[] | ReadonlyMap<string, readonly string[]> = []
) => {
  let state = start;
  let open = initial;
  const events: unknown[] = [];
  const openApp = createOpenApp({
    apps: APPS,
    opensInMeru: (app, profileId) =>
      !(
        inBrowser instanceof Map ? (inBrowser.get(profileId) ?? []) : inBrowser
      ).includes(app.id),
    systemBrowser: {
      open: (url) => {
        events.push(["browser", url]);

        return Promise.resolve();
      },
    },
    state: () => state,
    overlays: {
      open: (next) => {
        open = next;
        events.push(["open", next]);
      },
      close: () => {
        open = undefined;
        events.push(["close"]);
      },
      current: () => open,
    },
    openTab: (profileId, app, url, _after, split) => {
      events.push(["tab", profileId, app.id, url, ...(split ? [split] : [])]);

      return Promise.resolve();
    },
    splitTab: (key, direction) => {
      events.push(["split", key, direction]);

      return Promise.resolve();
    },
    selectTab: (key) => {
      events.push(["select", key.tabId]);

      return Promise.resolve();
    },
    showOwnWindow: (key) => {
      events.push(["own window", key.tabId]);
    },
    removeBookmark: (profileId, id) => {
      state = {
        ...state,
        profiles: state.profiles.map((profile) =>
          profile.id === profileId
            ? {
                ...profile,
                bookmarks: bookmarks(state, profileId).filter(
                  (bookmark) => bookmark.id !== id
                ),
              }
            : profile
        ),
      };

      return Promise.resolve();
    },
    pageUrl: (key) => pages[key.tabId],
    pageSize: () => pageSize ?? { width: 1000, height: 700 },
    log: silentLog,
  });

  return { openApp, events, state: () => state };
};

const WEEK = "https://calendar.google.com/calendar/u/0/r/week";
const DOC = "https://docs.google.com/document/d/abc/edit";
const SHEET = "https://docs.google.com/spreadsheets/d/xyz/edit";

/** Profile `a` with tabs at the week, in the main window, and the doc, in its own; and a bookmark of each and of a sheet. */
const withBookmarks: State = {
  version: 1,
  profiles: [
    {
      ...newProfile("a", "Default"),
      tabs: [
        gmailTab(),
        { id: "c1", app: "calendar", url: WEEK, title: "Week" },
        { id: "d1", app: "docs", url: DOC, title: "Plan", ownWindow: true },
      ],
      selectedTabId: "gmail",
      bookmarks: [
        { id: "w", url: WEEK, title: "Week", app: "calendar" },
        { id: "p", url: DOC, title: "Plan", app: "docs" },
        { id: "s", url: SHEET, title: "Budget", app: "sheets" },
      ],
    },
  ],
  selectedProfileId: "a",
};

/** What choosing the bookmark does with Calendar and Sheets sent to the default browser. */
const pick = async (overlay: Overlay, id: string) => {
  const { openApp, events } = setup(overlay, withBookmarks, undefined, {}, [
    "calendar",
    "sheets",
  ]);

  await openApp.chooseBookmark(id);

  return events;
};

describe(createOpenApp, () => {
  it("opens over the selected profile, and closes only itself", () => {
    const { openApp, events } = setup({ kind: "inbox" });

    openApp.setOpen(false);
    openApp.setOpen(true);

    const opened = openApp.isOpen();

    openApp.setOpen(false);

    expect([opened, openApp.isOpen(), events]).toStrictEqual([
      true,
      false,
      [["open", { kind: "open-app", profileId: "b" }], ["close"]],
    ]);
  });

  it("closes, then opens the chosen app's home as a tab of its profile", async () => {
    const { openApp, events } = setup({ kind: "open-app", profileId: "a" });
    const calendar = APPS.find(({ id }) => id === "calendar");

    await openApp.choose("calendar");

    expect(events).toStrictEqual([
      ["close"],
      ["tab", "a", "calendar", calendar?.home],
    ]);
  });

  it("refuses an app it does not list, and any while it is not open", async () => {
    const listed = setup({ kind: "open-app", profileId: "a" });
    const closed = setup({ kind: "inbox" });

    await listed.openApp.choose("gmail");
    await listed.openApp.choose("nowhere");
    await closed.openApp.choose("calendar");

    expect([listed.events, closed.events]).toStrictEqual([[], []]);
  });

  it("opens as Open in split beside the selected tab, and puts the pick in a new pane, Gmail's own tab as it is", async () => {
    const calendarTab = { id: "c1", app: "calendar", url: "", title: "" };
    const onCalendar: State = {
      ...two,
      profiles: [
        newProfile("a", "Default"),
        {
          ...newProfile("b", "Work"),
          tabs: [gmailTab(), calendarTab],
          selectedTabId: "c1",
        },
      ],
    };
    const { openApp, events } = setup(undefined, onCalendar);
    const drive = APPS.find(({ id }) => id === "drive");

    openApp.openSplit("row");
    await openApp.choose("drive");
    openApp.openSplit("column");
    await openApp.choose("gmail");

    expect(events).toStrictEqual([
      ["open", { kind: "open-app", profileId: "b", split: "row" }],
      ["close"],
      ["tab", "b", "drive", drive?.home, "row"],
      ["open", { kind: "open-app", profileId: "b", split: "column" }],
      ["close"],
      ["split", { profileId: "b", tabId: "gmail" }, "column"],
    ]);
  });

  it("says there is no room instead of opening, or of splitting where the page shrank meanwhile", async () => {
    const narrow = setup(undefined, two, { width: 480, height: 700 });

    narrow.openApp.openSplit("row");
    narrow.openApp.openSplit("column");

    const shrunk = setup(
      { kind: "open-app", profileId: "b", split: "row" },
      two,
      { width: 400, height: 400 }
    );

    await shrunk.openApp.choose("drive");

    expect([narrow.events, shrunk.events]).toStrictEqual([
      [
        ["open", { kind: "toast", message: "no-room" }],
        ["open", { kind: "open-app", profileId: "b", split: "column" }],
      ],
      [["close"], ["open", { kind: "toast", message: "no-room" }]],
    ]);
  });

  it("chooses a bookmark, closing: the tab at its page, its own window's, or a new tab of its app", async () => {
    const { openApp, events } = setup(undefined, withBookmarks);

    for (const id of ["w", "p", "s"]) {
      openApp.setOpen(true);
      // oxlint-disable-next-line no-await-in-loop -- one choice at a time
      await openApp.chooseBookmark(id);
    }

    const opened = ["open", { kind: "open-app", profileId: "a" }];

    expect(events).toStrictEqual([
      opened,
      ["close"],
      ["select", "c1"],
      opened,
      ["close"],
      ["own window", "d1"],
      opened,
      ["close"],
      ["tab", "a", "sheets", SHEET],
    ]);
  });

  it("matches a bookmark against the page a tab shows now, not its saved URL, which lags behind it", async () => {
    const { openApp, events } = setup(undefined, withBookmarks, undefined, {
      c1: `${WEEK}#day`,
      d1: SHEET,
    });

    for (const id of ["w", "s"]) {
      openApp.setOpen(true);
      // oxlint-disable-next-line no-await-in-loop -- one choice at a time
      await openApp.chooseBookmark(id);
    }

    const opened = ["open", { kind: "open-app", profileId: "a" }];

    expect(events).toStrictEqual([
      opened,
      ["close"],
      ["tab", "a", "calendar", WEEK],
      opened,
      ["close"],
      ["own window", "d1"],
    ]);
  });

  it("opens a bookmark as Open in split in the new pane as a new tab, though a tab is at its page, or says there is no room", async () => {
    const roomy = setup(
      { kind: "open-app", profileId: "a", split: "row" },
      withBookmarks
    );
    const shrunk = setup(
      { kind: "open-app", profileId: "a", split: "column" },
      withBookmarks,
      { width: 400, height: 400 }
    );

    await roomy.openApp.chooseBookmark("w");
    await shrunk.openApp.chooseBookmark("w");

    expect([roomy.events, shrunk.events]).toStrictEqual([
      [["close"], ["tab", "a", "calendar", WEEK, "row"]],
      [["close"], ["open", { kind: "toast", message: "no-room" }]],
    ]);
  });

  it("sends an app Tabs & Google Apps sends out to the default browser, closing, as New tab or Open in split", async () => {
    const drive = APPS.find(({ id }) => id === "drive");
    const tab = setup(
      { kind: "open-app", profileId: "a" },
      two,
      undefined,
      {},
      ["drive"]
    );
    const split = setup(
      { kind: "open-app", profileId: "b", split: "row" },
      two,
      undefined,
      {},
      ["drive"]
    );

    await tab.openApp.choose("drive");
    await split.openApp.choose("drive");

    expect([tab.events, split.events]).toStrictEqual([
      [["close"], ["browser", drive?.home]],
      [["close"], ["browser", drive?.home]],
    ]);
  });

  it("reads where an app opens for the profile New tab is over, so a profile sending Drive out opens it in the browser and another as a tab", async () => {
    const drive = APPS.find(({ id }) => id === "drive");
    const out = new Map([["b", ["drive"]]]);
    const work = setup(
      { kind: "open-app", profileId: "b" },
      two,
      undefined,
      {},
      out
    );
    const home = setup(
      { kind: "open-app", profileId: "a" },
      two,
      undefined,
      {},
      out
    );
    const workSplit = setup(
      { kind: "open-app", profileId: "b", split: "row" },
      two,
      undefined,
      {},
      out
    );

    await work.openApp.choose("drive");
    await home.openApp.choose("drive");
    await workSplit.openApp.choose("drive");

    expect([work.events, home.events, workSplit.events]).toStrictEqual([
      [["close"], ["browser", drive?.home]],
      [["close"], ["tab", "a", "drive", drive?.home]],
      [["close"], ["browser", drive?.home]],
    ]);
  });

  it("reads where a bookmark opens for the profile it belongs to", async () => {
    const sentOut = setup(
      { kind: "open-app", profileId: "a" },
      withBookmarks,
      undefined,
      {},
      new Map([["a", ["sheets"]]])
    );
    const kept = setup(
      { kind: "open-app", profileId: "a" },
      withBookmarks,
      undefined,
      {},
      new Map([["b", ["sheets"]]])
    );

    await sentOut.openApp.chooseBookmark("s");
    await kept.openApp.chooseBookmark("s");

    expect([sentOut.events, kept.events.at(-1)]).toStrictEqual([
      [["close"], ["browser", SHEET]],
      ["tab", "a", "sheets", SHEET],
    ]);
  });

  it("sends a bookmark of such an app out where it would open a new tab, and still selects its tab where one is at its page", async () => {
    expect([
      await pick({ kind: "open-app", profileId: "a" }, "s"),
      await pick({ kind: "open-app", profileId: "a" }, "w"),
      await pick({ kind: "open-app", profileId: "a", split: "row" }, "w"),
    ]).toStrictEqual([
      [["close"], ["browser", SHEET]],
      [["close"], ["select", "c1"]],
      [["close"], ["browser", WEEK]],
    ]);
  });

  it("sends a sheet's bookmark out with Sheets alone sent out, by the app it was saved as, never as a tab of Docs, whose host it shares", async () => {
    const { openApp, events } = setup(
      { kind: "open-app", profileId: "a", split: "row" },
      withBookmarks,
      undefined,
      {},
      ["sheets"]
    );

    await openApp.chooseBookmark("s");

    expect(events).toStrictEqual([["close"], ["browser", SHEET]]);
  });

  it("removes a bookmark it lists, staying open, and refuses either with nothing open or for a bookmark the profile has not", async () => {
    const listed = setup({ kind: "open-app", profileId: "a" }, withBookmarks);
    const closed = setup({ kind: "inbox" }, withBookmarks);

    await listed.openApp.removeBookmark("p");
    await listed.openApp.chooseBookmark("gone");
    await closed.openApp.removeBookmark("w");
    await closed.openApp.chooseBookmark("w");

    expect([
      listed.openApp.isOpen(),
      bookmarks(listed.state(), "a").map(({ id }) => id),
      listed.events,
      bookmarks(closed.state(), "a").map(({ id }) => id),
      closed.events,
    ]).toStrictEqual([true, ["w", "s"], [], ["w", "p", "s"], []]);
  });
});
