import type { App } from "#core/apps.ts";
import { findApp } from "#core/apps.ts";
import { bookmarkablePage, bookmarks } from "#core/bookmarks.ts";
import type { BookmarkedPage, PageNow } from "#core/bookmarks.ts";
import { coversPage } from "#core/overlay.ts";
import { inOwnWindow, selectedProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import { findTab } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";

import type { Overlays } from "./overlay.ts";

export interface BookmarksDeps {
  /** The registry, or the suite's stand-ins for it. */
  apps: readonly App[];
  state: () => State;
  overlays: Pick<Overlays, "open" | "current">;
  /** What the tab's page is doing now, and where it is. */
  page: (key: TabKey) => PageNow;
  /** Says whether the page is bookmarked now, or nothing when nothing changed. */
  toggle: (
    profileId: string,
    page: BookmarkedPage
  ) => Promise<boolean | undefined>;
  log: (message: string) => void;
}

/**
 * The profiles' bookmarks: Bookmark Tab and Remove Bookmark on a tab's
 * page, and the rows New tab lists.
 */
export const createBookmarks = ({
  apps,
  state,
  overlays,
  page,
  toggle,
  log,
}: BookmarksDeps) => {
  const appName = (id: string) => findApp(apps, id)?.name ?? id;

  /** The tab's page while it can be bookmarked. */
  const pageOf = (key: TabKey) => {
    const tab = findTab(state(), key);

    return tab && bookmarkablePage(tab, page(key), appName);
  };

  // The shell's state asks of every tab on each change, so each profile's
  // list is read once per state rather than once per tab.
  const urls = new WeakMap<State, Map<string, Set<string>>>();

  const bookmarkedUrls = (profileId: string) => {
    const now = state();
    const profiles = urls.get(now) ?? new Map<string, Set<string>>();
    const known = profiles.get(profileId);

    if (known) {
      return known;
    }

    const read = new Set(bookmarks(now, profileId).map(({ url }) => url));

    profiles.set(profileId, read);
    urls.set(now, profiles);

    return read;
  };

  const bookmarked = (key: TabKey) => {
    const bookmarkable = pageOf(key);

    return bookmarkable && bookmarkedUrls(key.profileId).has(bookmarkable.url);
  };

  return {
    /**
     * Whether the tab's page is bookmarked, or `undefined` while it cannot
     * be, as a Gmail, sleeping or loading tab's.
     */
    bookmarked,
    /**
     * Whether the page Bookmark Tab acts on is bookmarked, or `undefined`
     * while it cannot be: the page of the tab whose own window `ownWindow`
     * names, else the selected tab's in the main window, the focused pane's
     * in a split, while no card covers it.
     */
    acting: (ownWindow: TabKey | undefined) => {
      if (ownWindow) {
        return bookmarked(ownWindow);
      }

      const profile = selectedProfile(state());
      const key = { profileId: profile.id, tabId: profile.selectedTabId };
      const tab = findTab(state(), key);

      return tab && !inOwnWindow(tab) && !coversPage(overlays.current())
        ? bookmarked(key)
        : undefined;
    },
    /**
     * Bookmark Tab or Remove Bookmark on the tab's page; with `announce`, a
     * toast says which, unless a card or the find bar is open, which it
     * would replace.
     */
    toggle: async (key: TabKey, announce: boolean) => {
      const bookmarkable = pageOf(key);

      if (!bookmarkable) {
        log("Refused to bookmark a tab whose page cannot be bookmarked");

        return;
      }

      const now = await toggle(key.profileId, bookmarkable);

      const open = overlays.current();

      if (
        now === undefined ||
        !announce ||
        coversPage(open) ||
        open?.kind === "find"
      ) {
        return;
      }

      overlays.open(
        now
          ? { kind: "toast", message: "bookmarked", title: bookmarkable.title }
          : { kind: "toast", message: "bookmark-removed" }
      );
    },
    /** The rows New tab lists, each with its app's name. */
    rows: (profileId: string) =>
      bookmarks(state(), profileId).map(({ id, title, app }) => ({
        id,
        title,
        app,
        appName: appName(app),
      })),
  };
};

export type Bookmarks = ReturnType<typeof createBookmarks>;
