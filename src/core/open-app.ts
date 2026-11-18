import type { App } from "./apps.ts";
import { splitTabs } from "./split.ts";
import { knownTabs } from "./state.ts";
import type { Profile } from "./state.ts";

/**
 * What New tab lists for a profile, in the registry's order: every app but
 * a single-instance one the profile has a tab of already.
 */
export const openableApps = <Listed extends Pick<App, "id" | "singleInstance">>(
  apps: readonly Listed[],
  profile: Pick<Profile, "tabs">
): Listed[] => {
  const open = new Set(knownTabs(profile).map((tab) => tab.app));

  return apps.filter((app) => !(app.singleInstance && open.has(app.id)));
};

/**
 * What Open in split lists: every app, a single-instance one included,
 * whose tab is then used, moved from another split if in one, unless that
 * tab already has a pane in the shown split or is the selected one, which
 * the new pane goes beside.
 */
export const splittableApps = <
  Listed extends Pick<App, "id" | "singleInstance">,
>(
  apps: readonly Listed[],
  profile: Pick<Profile, "tabs" | "splits" | "selectedTabId">
): Listed[] => {
  const paned = new Set([
    ...splitTabs(profile, profile.selectedTabId),
    profile.selectedTabId,
  ]);
  const inPanes = new Set(
    knownTabs(profile)
      .filter((tab) => paned.has(tab.id))
      .map((tab) => tab.app)
  );

  return apps.filter((app) => !(app.singleInstance && inPanes.has(app.id)));
};

const holds = (text: string, typed: string) =>
  text.toLocaleLowerCase().includes(typed);

/** Those whose name holds what was typed, in any case; all for nothing typed. */
export const filterApps = <Listed extends Pick<App, "name">>(
  apps: readonly Listed[],
  query: string
): Listed[] => {
  const typed = query.trim().toLocaleLowerCase();

  return apps.filter((app) => holds(app.name, typed));
};

/** A bookmark as the launcher lists it, with its app's name. */
export interface LauncherBookmark {
  title: string;
  appName: string;
}

/**
 * What the launcher lists for what was typed: the apps whose name holds
 * it, then the bookmarks whose title or app's name does, each in its order.
 */
export const launcherItems = <
  ListedApp extends Pick<App, "name">,
  ListedBookmark extends LauncherBookmark,
>(
  apps: readonly ListedApp[],
  bookmarks: readonly ListedBookmark[],
  query: string
) => {
  const typed = query.trim().toLocaleLowerCase();

  return {
    apps: filterApps(apps, query),
    bookmarks: bookmarks.filter(
      (bookmark) =>
        holds(bookmark.title, typed) || holds(bookmark.appName, typed)
    ),
  };
};
