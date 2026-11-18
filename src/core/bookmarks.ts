import { z } from "zod/mini";

import { isAppId } from "./apps.ts";
import type { AppId } from "./apps.ts";
import { isWebUrl } from "./google-redirect.ts";
import { inOwnWindow, knownTabs } from "./state.ts";
import type { State, Tab } from "./state.ts";
import type { TabKey } from "./tabs.ts";

// Loose, so a key a later build adds survives this one writing the list.
const bookmarkSchema = z.looseObject({
  id: z.string().check(z.minLength(1)),
  url: z.string().check(z.minLength(1)),
  title: z.string(),
  /** The app whose tab it was saved from, which gives its icon and name. */
  app: z.string(),
});

/** A page saved in a profile, as it was when saved. */
export type Bookmark = z.infer<typeof bookmarkSchema> & { app: AppId };

/** What a bookmark of a page holds. */
export interface BookmarkedPage {
  url: string;
  title: string;
  app: AppId;
}

/** What the tab's page is doing now, which says whether it can be saved. */
export interface PageNow {
  /** Its page has loaded and shows, not asleep, failed or crashed. */
  live: boolean;
  /** A new document is loading in it. */
  loading: boolean;
  /**
   * Where its page is and what it is called now, ahead of the tab's saved
   * URL and title, which are written at most once a second.
   */
  url?: string;
  title?: string | undefined;
}

const isWebAddress = (url: string) => {
  const parsed = URL.parse(url);

  return parsed !== null && isWebUrl(parsed);
};

const readable = (entry: unknown): Bookmark | undefined => {
  const parsed = bookmarkSchema.safeParse(entry);

  return parsed.success &&
    isAppId(parsed.data.app) &&
    isWebAddress(parsed.data.url)
    ? { ...parsed.data, app: parsed.data.app }
    : undefined;
};

const stored = (state: State, profileId: string) =>
  state.profiles.find((profile) => profile.id === profileId)?.bookmarks;

/**
 * The profile's bookmarks that can be read, in the order they were saved.
 * An entry that does not parse, names an app this build does not know or
 * repeats an earlier one's id is kept in the file where it was, and not
 * shown; a `bookmarks` that is not a list reads as none and is kept as
 * found. There is no cap, as v3 had none.
 */
export const bookmarks = (state: State, profileId: string): Bookmark[] => {
  const entries = stored(state, profileId);

  if (!Array.isArray(entries)) {
    return [];
  }

  const ids = new Set<string>();

  return entries.flatMap((entry: unknown) => {
    const bookmark = readable(entry);

    if (!bookmark || ids.has(bookmark.id)) {
      return [];
    }

    ids.add(bookmark.id);

    return [bookmark];
  });
};

/**
 * The profile's bookmark of `url`. URLs match exactly, fragment and query
 * included, as v3 matched them: a Calendar week or a Docs heading reached by
 * its fragment is a page of its own.
 */
export const bookmarkOf = (state: State, profileId: string, url: string) =>
  bookmarks(state, profileId).find((bookmark) => bookmark.url === url);

/**
 * The page of the tab to bookmark, while it can be: not Gmail's, which
 * v3 never bookmarked, of an app this build knows, at a web address, and
 * shown with no new document loading, so a sleeping, failed, crashed or
 * loading page has none. The URL and title are the page's now, else the
 * tab's, and the title is its app's name when empty.
 */
export const bookmarkablePage = (
  tab: Pick<Tab, "app" | "url" | "title">,
  page: PageNow,
  appName: (app: AppId) => string
): BookmarkedPage | undefined => {
  const { app } = tab;
  const url = page.url ?? tab.url;
  const title = page.title ?? tab.title;

  return isAppId(app) &&
    app !== "gmail" &&
    page.live &&
    !page.loading &&
    isWebAddress(url)
    ? { url, title: title.trim() || appName(app), app }
    : undefined;
};

/** Whether the list in the file is one this build can add to. */
const canAdd = (state: State, profileId: string) => {
  const entries = stored(state, profileId);

  return (
    state.profiles.some((profile) => profile.id === profileId) &&
    (entries === undefined || Array.isArray(entries))
  );
};

const withBookmarks = (
  state: State,
  profileId: string,
  change: (entries: unknown[]) => unknown[]
): State => ({
  ...state,
  profiles: state.profiles.map((profile) => {
    if (profile.id !== profileId) {
      return profile;
    }

    const entries = profile.bookmarks;

    return {
      ...profile,
      bookmarks: change(Array.isArray(entries) ? entries : []),
    };
  }),
});

/**
 * Without the profile's bookmark whose id is `id`, the one shown: a later
 * entry repeating its id, and entries that do not parse, stay where they
 * were. Nothing when there is none to remove.
 */
export const removeBookmark = (
  state: State,
  profileId: string,
  id: string
): State | undefined =>
  bookmarks(state, profileId).some((bookmark) => bookmark.id === id)
    ? withBookmarks(state, profileId, (entries) => {
        const index = entries.findIndex((entry) => readable(entry)?.id === id);

        return entries.filter((_, at) => at !== index);
      })
    : undefined;

export interface Toggled {
  state: State;
  /** Whether the page is bookmarked now. */
  bookmarked: boolean;
}

/**
 * Bookmark Tab or Remove Bookmark: removes the profile's bookmark of the
 * page's URL, or adds one at the end. Nothing when the profile is gone or
 * its list is one this build cannot add to.
 */
export const toggleBookmark = (
  state: State,
  profileId: string,
  page: BookmarkedPage,
  newId: () => string
): Toggled | undefined => {
  const existing = bookmarkOf(state, profileId, page.url);

  if (existing) {
    const next = removeBookmark(state, profileId, existing.id);

    return next && { state: next, bookmarked: false };
  }

  return canAdd(state, profileId)
    ? {
        state: withBookmarks(state, profileId, (entries) => [
          ...entries,
          { id: newId(), url: page.url, title: page.title, app: page.app },
        ]),
        bookmarked: true,
      }
    : undefined;
};

/** What choosing a bookmark does. */
export type BookmarkChoice =
  /**
   * Selects the profile's tab already at its URL, waking it if it sleeps,
   * or brings forward its own window if it is in one.
   */
  | { kind: "select"; key: TabKey; ownWindow: boolean }
  /** Opens its URL as a new tab of its app, selected. */
  | { kind: "open"; app: AppId; url: string };

/**
 * What choosing the profile's bookmark `id` does: a tab of the profile at
 * exactly its URL, as the bookmark matches, is selected; otherwise a new
 * tab of its app opens there. Nothing for a bookmark the profile has not.
 */
export const chooseBookmark = (
  state: State,
  profileId: string,
  id: string
): BookmarkChoice | undefined => {
  const profile = state.profiles.find(
    (candidate) => candidate.id === profileId
  );
  const bookmark = bookmarks(state, profileId).find(
    (candidate) => candidate.id === id
  );

  if (!profile || !bookmark) {
    return;
  }

  const open = knownTabs(profile).find((tab) => tab.url === bookmark.url);

  return open
    ? {
        kind: "select",
        key: { profileId, tabId: open.id },
        ownWindow: inOwnWindow(open),
      }
    : { kind: "open", app: bookmark.app, url: bookmark.url };
};
