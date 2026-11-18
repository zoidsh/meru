import type { App } from "./apps.ts";
import { splitTabs } from "./split.ts";
import { knownTabs } from "./state.ts";
import type { Profile } from "./state.ts";

/**
 * What Open app lists for a profile, in the registry's order: every app but
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
 * whose tab is then used, unless that tab already has a pane or is the
 * selected one, which the new pane goes beside.
 */
export const splittableApps = <
  Listed extends Pick<App, "id" | "singleInstance">,
>(
  apps: readonly Listed[],
  profile: Pick<Profile, "tabs" | "split" | "selectedTabId">
): Listed[] => {
  const paned = new Set([...splitTabs(profile), profile.selectedTabId]);
  const inPanes = new Set(
    knownTabs(profile)
      .filter((tab) => paned.has(tab.id))
      .map((tab) => tab.app)
  );

  return apps.filter((app) => !(app.singleInstance && inPanes.has(app.id)));
};

/** Those whose name holds what was typed, in any case; all for nothing typed. */
export const filterApps = <Listed extends Pick<App, "name">>(
  apps: readonly Listed[],
  query: string
): Listed[] => {
  const typed = query.trim().toLocaleLowerCase();

  return apps.filter((app) => app.name.toLocaleLowerCase().includes(typed));
};
