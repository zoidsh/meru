import type { App } from "#core/apps.ts";
import { findApp } from "#core/apps.ts";
import {
  bookmarkOf,
  bookmarkablePage,
  bookmarks,
  chooseBookmark,
} from "#core/bookmarks.ts";
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
  overlays: Pick<Overlays, "open" | "close" | "current">;
  /** What the tab's page is doing now. */
  page: (key: TabKey) => PageNow;
  /** Says whether the page is bookmarked now, or nothing when nothing changed. */
  toggle: (
    profileId: string,
    page: BookmarkedPage
  ) => Promise<boolean | undefined>;
  remove: (profileId: string, id: string) => Promise<unknown>;
  /** Selects the tab in the main window, waking it if it sleeps. */
  selectTab: (key: TabKey) => Promise<unknown>;
  /** Brings the tab's own window forward, its page focused. */
  showOwnWindow: (key: TabKey) => void;
  /** Opens `url` as a new tab of `app` in the profile, selected. */
  openTab: (profileId: string, app: App, url: string) => Promise<unknown>;
  log: (message: string) => void;
}

/**
 * The profiles' bookmarks: Bookmark Tab and Remove Bookmark on a tab's page,
 * and the Bookmarks overlay over the selected profile, whose rows open a
 * page, selecting a tab already at it, and are removed in place.
 */
export const createBookmarks = ({
  apps,
  state,
  overlays,
  page,
  toggle,
  remove,
  selectTab,
  showOwnWindow,
  openTab,
  log,
}: BookmarksDeps) => {
  const current = () => {
    const open = overlays.current();

    return open?.kind === "bookmarks" ? open : undefined;
  };

  const appName = (id: string) => findApp(apps, id)?.name ?? id;

  /** The tab's page while it can be bookmarked. */
  const pageOf = (key: TabKey) => {
    const tab = findTab(state(), key);

    return tab && bookmarkablePage(tab, page(key), appName);
  };

  const bookmarked = (key: TabKey) => {
    const bookmarkable = pageOf(key);

    return (
      bookmarkable &&
      bookmarkOf(state(), key.profileId, bookmarkable.url) !== undefined
    );
  };

  return {
    isOpen: () => current() !== undefined,
    /** Opens it over the selected profile, replacing any other, or closes it. */
    setOpen: (open: boolean) => {
      if (open) {
        overlays.open({
          kind: "bookmarks",
          profileId: state().selectedProfileId,
        });
      } else if (current()) {
        overlays.close();
      }
    },
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
     * toast says which, unless a card covers the page.
     */
    toggle: async (key: TabKey, announce: boolean) => {
      const bookmarkable = pageOf(key);

      if (!bookmarkable) {
        log("Refused to bookmark a tab whose page cannot be bookmarked");

        return;
      }

      const now = await toggle(key.profileId, bookmarkable);

      if (now === undefined || !announce || coversPage(overlays.current())) {
        return;
      }

      overlays.open(
        now
          ? { kind: "toast", message: "bookmarked", title: bookmarkable.title }
          : { kind: "toast", message: "bookmark-removed" }
      );
    },
    /** The open overlay's rows, each with its app's name. */
    rows: (profileId: string) =>
      bookmarks(state(), profileId).map(({ id, title, app }) => ({
        id,
        title,
        app,
        appName: appName(app),
      })),
    /**
     * Opens the open overlay's bookmark `id` and closes the overlay: the
     * profile's tab at its URL, woken or its window brought forward, or a
     * new tab of its app.
     */
    choose: async (id: string) => {
      const open = current();
      const choice = open && chooseBookmark(state(), open.profileId, id);
      const app =
        choice?.kind === "open" ? findApp(apps, choice.app) : undefined;

      if (!open || !choice || (choice.kind === "open" && !app)) {
        log("Refused to open a bookmark the open overlay does not list");

        return;
      }

      overlays.close();

      if (choice.kind === "select") {
        if (choice.ownWindow) {
          showOwnWindow(choice.key);
        } else {
          await selectTab(choice.key);
        }
      } else if (app) {
        await openTab(open.profileId, app, choice.url);
      }
    },
    /** Removes the open overlay's bookmark `id`, the overlay staying open. */
    remove: async (id: string) => {
      const open = current();

      if (!open) {
        log("Refused to remove a bookmark with no overlay open");

        return;
      }

      await remove(open.profileId, id);
    },
  };
};

export type Bookmarks = ReturnType<typeof createBookmarks>;
