import type { App } from "#core/apps.ts";
import { openableApps, splittableApps } from "#core/open-app.ts";
import type { PaneDirection } from "#core/pane-tree.ts";
import { splitFits, splitTarget } from "#core/split.ts";
import { knownTabs, selectedProfile } from "#core/state.ts";
import type { Profile, State } from "#core/state.ts";
import type { TabKey } from "#core/tabs.ts";
import type { Size } from "#core/window-bounds.ts";

import type { Overlays } from "./overlay.ts";

export interface OpenAppDeps {
  /** The registry, or the suite's stand-ins for it. */
  apps: readonly App[];
  state: () => State;
  overlays: Pick<Overlays, "open" | "close" | "current">;
  /**
   * Opens `url` as a tab of `app` in the profile, selected, with `split` in
   * a new pane that way of the focused one.
   */
  openTab: (
    profileId: string,
    app: App,
    url: string,
    after?: string,
    split?: PaneDirection
  ) => Promise<unknown>;
  /** Puts a tab the profile has in a new pane that way of the focused one. */
  splitTab: (key: TabKey, direction: PaneDirection) => Promise<unknown>;
  /** The page area's size now, which a split must leave room in. */
  pageSize: () => Size;
  log: (message: string) => void;
}

/**
 * The Open app overlay, over the selected profile: it lists what that
 * profile can open, and choosing one closes it and opens the app's home as a
 * new tab, selected, as a link to it would; focus follows the new tab. As
 * Open in split, from Split right or Split down, the pick goes in a new pane
 * beside or below the focused one, a single-instance app's tab as it is.
 */
export const createOpenApp = ({
  apps,
  state,
  overlays,
  openTab,
  splitTab,
  pageSize,
  log,
}: OpenAppDeps) => {
  const current = () => {
    const open = overlays.current();

    return open?.kind === "open-app" ? open : undefined;
  };

  const fits = (profile: Profile, direction: PaneDirection) => {
    if (splitFits(profile, direction, pageSize())) {
      return true;
    }

    overlays.open({ kind: "toast", message: "no-room" });

    return false;
  };

  const chooseForSplit = async (
    profile: Profile,
    app: App,
    direction: PaneDirection
  ) => {
    overlays.close();

    if (!fits(profile, direction)) {
      return;
    }

    const existing = app.singleInstance
      ? knownTabs(profile).find((tab) => tab.app === app.id)
      : undefined;

    await (existing
      ? splitTab({ profileId: profile.id, tabId: existing.id }, direction)
      : openTab(profile.id, app, app.home, undefined, direction));
  };

  return {
    isOpen: () => current() !== undefined,
    /** Opens it over the selected profile, replacing any other, or closes it. */
    setOpen: (open: boolean) => {
      if (open) {
        overlays.open({
          kind: "open-app",
          profileId: state().selectedProfileId,
        });
      } else if (current()) {
        overlays.close();
      }
    },
    /**
     * Opens Open in split over the selected profile, unless it has no pane
     * to split beside, or the toast saying there is no room.
     */
    openSplit: (direction: PaneDirection) => {
      // Split view is Pro: the one place its gate goes.
      const profile = selectedProfile(state());

      if (splitTarget(profile) === undefined) {
        log("Refused a split with no known tab selected");

        return;
      }

      if (fits(profile, direction)) {
        overlays.open({
          kind: "open-app",
          profileId: profile.id,
          split: direction,
        });
      }
    },
    /**
     * Opens the app, only one the open overlay lists, so a shell cannot
     * name another or another profile.
     */
    choose: async (appId: string) => {
      const open = current();
      const profile =
        open && state().profiles.find(({ id }) => id === open.profileId);
      const listed =
        profile &&
        (open.split
          ? splittableApps(apps, profile)
          : openableApps(apps, profile));
      const app = listed?.find(({ id }) => id === appId);

      if (!open || !profile || !app) {
        log(`Refused to open ${appId}, which Open app does not list`);

        return;
      }

      if (open.split) {
        await chooseForSplit(profile, app, open.split);

        return;
      }

      overlays.close();
      await openTab(open.profileId, app, app.home);
    },
  };
};

export type OpenApp = ReturnType<typeof createOpenApp>;
