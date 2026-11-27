import { describe, expect, it } from "vitest";

import { APPS } from "#core/apps.ts";
import { bookmarks as bookmarksOf } from "#core/bookmarks.ts";
import type { PageNow } from "#core/bookmarks.ts";
import { silentLog } from "#core/log.fake.ts";
import type { Overlay } from "#core/overlay.ts";
import { gmailTab, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import { tabKey } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";

import { createBookmarks } from "./bookmarks.ts";
import { createProfiles } from "./profiles.ts";

const WEEK = "https://calendar.google.com/calendar/u/0/r/week";
const DOC = "https://docs.google.com/document/d/abc/edit";

const initial: State = {
  version: 1,
  profiles: [
    {
      ...newProfile("a", "Default"),
      tabs: [
        gmailTab(),
        { id: "c1", app: "calendar", url: WEEK, title: "Week" },
        { id: "d1", app: "docs", url: DOC, title: "Plan", ownWindow: true },
      ],
      selectedTabId: "c1",
    },
    newProfile("b", "Work"),
  ],
  selectedProfileId: "a",
};

const CALENDAR = { profileId: "a", tabId: "c1" };
const DOCS = { profileId: "a", tabId: "d1" };
const GMAIL = { profileId: "a", tabId: "gmail" };

const setup = (state: State = initial, overlay?: Overlay) => {
  let ids = 0;
  const profiles = createProfiles({
    initial: state,
    save: () => Promise.resolve(),
    newId: () => {
      ids += 1;

      return `id${ids}`;
    },
    profileName: (n) => `Profile ${n}`,
    clearSession: () => Promise.resolve(),
    now: () => 0,
    log: silentLog,
  });
  let open = overlay;
  const pages = new Map<string, PageNow>();
  const bookmarks = createBookmarks({
    apps: APPS,
    state: profiles.get,
    overlays: {
      open: (next) => {
        open = next;
      },
      current: () => open,
    },
    page: (key) => pages.get(tabKey(key)) ?? { live: true, loading: false },
    toggle: profiles.toggleBookmark,
    log: silentLog,
  });

  return {
    bookmarks,
    profiles,
    overlay: () => open,
    setPage: (key: TabKey, page: PageNow) => pages.set(tabKey(key), page),
  };
};

describe(createBookmarks, () => {
  it("bookmarks the selected tab's page with a toast, and removes it with another, the menu's label following", async () => {
    const { bookmarks, profiles, overlay } = setup();
    const before = bookmarks.acting(undefined);

    await bookmarks.toggle(CALENDAR, true);

    const added = [bookmarks.acting(undefined), overlay()];

    await bookmarks.toggle(CALENDAR, true);

    expect([
      before,
      added,
      bookmarks.acting(undefined),
      overlay(),
      bookmarksOf(profiles.get(), "a"),
    ]).toStrictEqual([
      false,
      [true, { kind: "toast", message: "bookmarked", title: "Week" }],
      false,
      { kind: "toast", message: "bookmark-removed" },
      [],
    ]);
  });

  it("bookmarks and tells of the page where it is now, ahead of the tab's saved URL and title", async () => {
    const { bookmarks, profiles, overlay, setPage } = setup();

    setPage(CALENDAR, { live: true, loading: false, url: DOC, title: "Plan" });

    const before = bookmarks.bookmarked(CALENDAR);

    await bookmarks.toggle(CALENDAR, true);

    expect([
      before,
      bookmarks.bookmarked(CALENDAR),
      overlay(),
      bookmarksOf(profiles.get(), "a").map(({ url, title }) => [url, title]),
    ]).toStrictEqual([
      false,
      true,
      { kind: "toast", message: "bookmarked", title: "Plan" },
      [[DOC, "Plan"]],
    ]);

    // Back at the saved page, which is not bookmarked.
    setPage(CALENDAR, { live: true, loading: false, url: WEEK });

    expect([bookmarks.bookmarked(CALENDAR)]).toStrictEqual([false]);
  });

  it("announces nothing over the find bar, which stays open", async () => {
    const find: Overlay = { kind: "find", profileId: "a", tabId: "c1" };
    const { bookmarks, overlay } = setup(initial, find);

    await bookmarks.toggle(CALENDAR, true);

    expect([bookmarks.bookmarked(CALENDAR), overlay()]).toStrictEqual([
      true,
      find,
    ]);
  });

  it("announces nothing for a tab's own window, or with a card over the page", async () => {
    const { bookmarks, overlay } = setup(initial, {
      kind: "inbox",
    });

    await bookmarks.toggle(DOCS, false);
    await bookmarks.toggle(CALENDAR, true);

    expect([
      bookmarks.bookmarked(DOCS),
      bookmarks.bookmarked(CALENDAR),
      overlay(),
    ]).toStrictEqual([true, true, { kind: "inbox" }]);
  });

  it("can bookmark no Gmail, sleeping, loading or failed page, nor the main window's under a card, but a tab's own window's", () => {
    const gmail = setup({
      ...initial,
      profiles: initial.profiles.map((profile) => ({
        ...profile,
        selectedTabId: "gmail",
      })),
    });
    const asleep = setup();
    const loading = setup();
    const covered = setup(initial, { kind: "open-app", profileId: "a" });

    asleep.setPage(CALENDAR, { live: false, loading: false });
    loading.setPage(CALENDAR, { live: true, loading: true });

    expect([
      gmail.bookmarks.acting(undefined),
      gmail.bookmarks.bookmarked(GMAIL),
      asleep.bookmarks.acting(undefined),
      loading.bookmarks.acting(undefined),
      covered.bookmarks.acting(undefined),
      covered.bookmarks.acting(DOCS),
    ]).toStrictEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      false,
    ]);
  });

  it("acts in a split on the focused pane's tab", () => {
    const [profile, other] = initial.profiles as [
      State["profiles"][number],
      State["profiles"][number],
    ];
    const split = (selectedTabId: string) =>
      setup({
        ...initial,
        profiles: [
          {
            ...profile,
            selectedTabId,
            splits: [
              {
                root: {
                  direction: "row",
                  children: [
                    { size: 0.5, pane: "gmail" },
                    { size: 0.5, pane: "c1" },
                  ],
                },
              },
            ],
          },
          other,
        ],
      }).bookmarks.acting(undefined);

    expect([split("gmail"), split("c1")]).toStrictEqual([undefined, false]);
  });

  it("follows the tab's page as it navigates", async () => {
    const { bookmarks, profiles } = setup();

    await bookmarks.toggle(CALENDAR, false);
    await profiles.updatePages([{ ...CALENDAR, url: `${WEEK}#today` }]);

    const moved = bookmarks.bookmarked(CALENDAR);

    await profiles.updatePages([{ ...CALENDAR, url: WEEK }]);

    expect([moved, bookmarks.bookmarked(CALENDAR)]).toStrictEqual([
      false,
      true,
    ]);
  });

  it("lists the rows with their apps' names", async () => {
    const { bookmarks } = setup();

    await bookmarks.toggle(CALENDAR, false);
    await bookmarks.toggle(DOCS, false);

    expect(bookmarks.rows("a")).toStrictEqual([
      { id: "id1", title: "Week", app: "calendar", appName: "Calendar" },
      { id: "id2", title: "Plan", app: "docs", appName: "Docs" },
    ]);
  });
});
