import { describe, expect, it } from "vitest";

import {
  bookmarkOf,
  bookmarkablePage,
  bookmarks,
  chooseBookmark,
  removeBookmark,
  toggleBookmark,
} from "./bookmarks.ts";
import { decodeState, encodeState } from "./state.ts";
import type { State } from "./state.ts";
import { updatePages } from "./tabs.ts";

const PROFILE = "p1";
const OTHER = "p2";
const WEEK = "https://calendar.google.com/calendar/u/0/r/week";
const DOC = "https://docs.google.com/document/d/abc/edit";

const stateWith = (bookmarksValue?: unknown, tabs: unknown[] = []): State => {
  const decoded = decodeState({
    version: 1,
    profiles: [
      {
        id: PROFILE,
        name: "Default",
        tabs,
        ...(bookmarksValue !== undefined && { bookmarks: bookmarksValue }),
      },
      { id: OTHER, name: "Work" },
    ],
    selectedProfileId: PROFILE,
  });

  if (decoded.kind !== "read") {
    throw new Error("The state did not decode");
  }

  return decoded.value;
};

const written = (state: State) =>
  (encodeState(state) as { profiles: Record<string, unknown>[] }).profiles[0]
    ?.bookmarks;

let ids = 0;
const newId = () => {
  ids += 1;

  return `b${ids}`;
};

const urlOf = (current: State) =>
  current.profiles[0]?.tabs.find((tab) => "url" in tab)?.url as string;

const week = { url: WEEK, title: "Week", app: "calendar" as const };
const live = { live: true, loading: false };
const appName = (app: string) => `${app}!`;

describe(bookmarks, () => {
  it("reads none from a profile that has none, or a list that is not one", () => {
    expect([
      bookmarks(stateWith(), PROFILE),
      bookmarks(stateWith(), "gone"),
      bookmarks(stateWith({ not: "a list" }), PROFILE),
    ]).toStrictEqual([[], [], []]);
  });

  it("reads the entries that parse, in order, and writes every entry back as found, unknown keys kept", () => {
    const entries = [
      { id: "a", url: WEEK, title: "Week", app: "calendar", later: 1 },
      { id: "a", url: DOC, title: "Repeats a's id", app: "docs" },
      { id: "b", url: DOC, title: "Plan", app: "docs" },
      { id: "c", url: DOC, title: "An app this build lacks", app: "keep" },
      {
        id: "d",
        url: "data:text/html,page",
        title: "No web page",
        app: "docs",
      },
      "not a bookmark",
    ];
    const state = stateWith(entries);

    expect([
      bookmarks(state, PROFILE).map(({ id }) => id),
      written(state),
    ]).toStrictEqual([["a", "b"], entries]);
  });
});

describe(toggleBookmark, () => {
  it("adds the page at the end, then removes it again, other entries kept where they were", () => {
    const odd = { id: "x", url: DOC, title: "Odd", app: "keep", more: true };
    const state = stateWith([odd]);
    const added = toggleBookmark(state, PROFILE, week, newId);
    const removed = added && toggleBookmark(added.state, PROFILE, week, newId);

    expect([
      added?.bookmarked,
      added && written(added.state),
      removed?.bookmarked,
      removed && written(removed.state),
    ]).toStrictEqual([
      true,
      [odd, { id: expect.any(String), ...week }],
      false,
      [odd],
    ]);
  });

  it("adds nothing to a list this build cannot add to, or a profile that is gone", () => {
    expect([
      toggleBookmark(stateWith({ not: "a list" }), PROFILE, week, newId),
      toggleBookmark(stateWith(), "gone", week, newId),
    ]).toStrictEqual([undefined, undefined]);
  });
});

describe(bookmarkOf, () => {
  it("matches the URL exactly, fragment and query included, as v3 did, following the tab as it navigates", () => {
    const tabs = [{ id: "c", app: "calendar", url: WEEK, title: "Week" }];
    const saved = toggleBookmark(
      stateWith(undefined, tabs),
      PROFILE,
      week,
      newId
    );
    const state = saved?.state ?? stateWith();
    const moved = updatePages(state, [
      { profileId: PROFILE, tabId: "c", url: `${WEEK}/2026/11/18` },
    ]);

    expect([
      bookmarkOf(state, PROFILE, urlOf(state))?.title,
      bookmarkOf(state, PROFILE, `${WEEK}#today`),
      bookmarkOf(state, PROFILE, `${WEEK}?tab=1`),
      bookmarkOf(state, PROFILE, `${WEEK}/`),
      moved && bookmarkOf(moved, PROFILE, urlOf(moved)),
      bookmarkOf(state, OTHER, WEEK),
    ]).toStrictEqual([
      "Week",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe(removeBookmark, () => {
  it("removes the bookmark shown, a later entry repeating its id staying, and nothing for one it has not", () => {
    const entries = [
      { id: "a", url: WEEK, title: "Week", app: "calendar" },
      { id: "a", url: DOC, title: "Repeat", app: "docs" },
    ];
    const state = stateWith(entries);
    const removed = removeBookmark(state, PROFILE, "a");

    expect([
      removed && written(removed),
      removeBookmark(state, PROFILE, "missing"),
    ]).toStrictEqual([[entries[1]], undefined]);
  });
});

describe(bookmarkablePage, () => {
  const tab = { app: "calendar", url: WEEK, title: "Week" };

  it("is the live page of a tab of any app but Gmail, its title or else its app's name", () => {
    expect([
      bookmarkablePage(tab, live, appName),
      bookmarkablePage({ ...tab, title: "  " }, live, appName)?.title,
    ]).toStrictEqual([week, "calendar!"]);
  });

  it("takes the page's URL and title now over the tab's saved ones", () => {
    expect([
      bookmarkablePage(tab, { ...live, url: DOC, title: "Plan" }, appName),
      bookmarkablePage(tab, { ...live, title: "" }, appName)?.title,
      bookmarkablePage(tab, { ...live, url: "about:blank" }, appName),
    ]).toStrictEqual([
      { url: DOC, title: "Plan", app: "calendar" },
      "calendar!",
      undefined,
    ]);
  });

  it("is none for Gmail, a page asleep, failed, crashed or loading, an unknown app or no web address", () => {
    expect([
      bookmarkablePage(
        { app: "gmail", url: "https://mail.google.com/mail/u/0", title: "" },
        live,
        appName
      ),
      bookmarkablePage(tab, { live: false, loading: false }, appName),
      bookmarkablePage(tab, { live: true, loading: true }, appName),
      bookmarkablePage({ ...tab, app: "keep" }, live, appName),
      bookmarkablePage({ ...tab, url: "about:blank" }, live, appName),
    ]).toStrictEqual([undefined, undefined, undefined, undefined, undefined]);
  });
});

describe(chooseBookmark, () => {
  const saved = [
    { id: "w", url: WEEK, title: "Week", app: "calendar" },
    { id: "d", url: DOC, title: "Plan", app: "docs" },
  ];

  it("selects the profile's tab at its URL, saying whether it is in its own window, whether it sleeps or not", () => {
    const state = stateWith(saved, [
      { id: "c", app: "calendar", url: WEEK, title: "Week" },
      { id: "e", app: "docs", url: DOC, title: "Plan", ownWindow: true },
    ]);

    expect([
      chooseBookmark(state, PROFILE, "w"),
      chooseBookmark(state, PROFILE, "d"),
    ]).toStrictEqual([
      {
        kind: "select",
        bookmark: saved[0],
        key: { profileId: PROFILE, tabId: "c" },
        ownWindow: false,
      },
      {
        kind: "select",
        bookmark: saved[1],
        key: { profileId: PROFILE, tabId: "e" },
        ownWindow: true,
      },
    ]);
  });

  it("opens a new tab of its app with none at its URL, and does nothing for a bookmark the profile has not", () => {
    const state = stateWith(saved, [
      { id: "c", app: "calendar", url: `${WEEK}#elsewhere`, title: "Week" },
    ]);

    expect([
      chooseBookmark(state, PROFILE, "w"),
      chooseBookmark(state, PROFILE, "missing"),
      chooseBookmark(state, OTHER, "w"),
    ]).toStrictEqual([
      { kind: "open", bookmark: saved[0] },
      undefined,
      undefined,
    ]);
  });
});
