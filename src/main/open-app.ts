import type { App } from "#core/apps.ts";
import { findApp } from "#core/apps.ts";
import { chooseBookmark } from "#core/bookmarks.ts";
import { openableApps, splittableApps } from "#core/open-app.ts";
import type { PaneDirection } from "#core/pane-tree.ts";
import { splitFits, splitTarget } from "#core/split.ts";
import { knownTabs, selectedProfile } from "#core/state.ts";
import type { Profile, State } from "#core/state.ts";
import type { TabKey } from "#core/tabs.ts";
import type { Size } from "#core/window-bounds.ts";
import type { SystemBrowser } from "#platform/system-browser.ts";

import type { Overlays } from "./overlay.ts";

export interface OpenAppDeps {
  /** The registry, or the suite's stand-ins for it. */
  apps: readonly App[];
  /** Whether a new tab of the app opens in Meru now, as Tabs & Google Apps says. */
  opensInMeru: (app: App) => boolean;
  /** Where a pick that does not open in Meru goes, asking first where it should. */
  systemBrowser: SystemBrowser;
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
  /** Selects the tab in the main window, waking it if it sleeps. */
  selectTab: (key: TabKey) => Promise<unknown>;
  /** Brings the tab's own window forward, its page focused. */
  showOwnWindow: (key: TabKey) => void;
  removeBookmark: (profileId: string, id: string) => Promise<unknown>;
  /**
   * The URL the tab's page shows now, where it has a live one: the saved
   * URL is written at most once a second, so it can lag behind.
   */
  pageUrl: (key: TabKey) => string | undefined;
  /** The page area's size now, which a split must leave room in. */
  pageSize: () => Size;
  log: (message: string) => void;
}

/**
 * New tab, the launcher over the selected profile: it lists the apps that
 * profile can open and its bookmarks. Choosing an app closes it and opens
 * the app's home as a new tab, selected, as a link to it would; focus
 * follows the new tab. Choosing a bookmark selects the profile's tab at its
 * page, waking it or bringing its own window forward, or opens it as a new
 * tab. As Open in split, from Split right or Split down, the pick goes in a
 * new pane beside or below the focused one, a single-instance app's tab as
 * it is, and a bookmark always as a new tab. A pick that would open a new
 * tab of an app Tabs & Google Apps sends to the default browser goes there instead.
 */
export const createOpenApp = ({
  apps,
  opensInMeru,
  systemBrowser,
  state,
  overlays,
  openTab,
  splitTab,
  selectTab,
  showOwnWindow,
  removeBookmark,
  pageUrl,
  pageSize,
  log,
}: OpenAppDeps) => {
  const current = () => {
    const open = overlays.current();

    return open?.kind === "open-app" ? open : undefined;
  };

  const openInSystemBrowser = async (url: string) => {
    try {
      await systemBrowser.open(url);
    } catch (error) {
      log(
        `The system browser did not open a pick: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  /** Sends `url` to the default browser if a new tab of `app` may not open in Meru. */
  const leaves = (app: App, url: string) => {
    if (opensInMeru(app)) {
      return false;
    }

    void openInSystemBrowser(url);

    return true;
  };

  const fits = (profile: Profile, direction: PaneDirection) => {
    const size = pageSize();

    if (splitFits(profile, direction, size)) {
      return true;
    }

    log(
      `Refused a split, ${direction}, with no room in a page area of ${size.width} by ${size.height}`
    );
    overlays.open({ kind: "toast", message: "no-room" });

    return false;
  };

  const chooseForSplit = async (
    profile: Profile,
    app: App,
    direction: PaneDirection
  ) => {
    overlays.close();

    const existing = app.singleInstance
      ? knownTabs(profile).find((tab) => tab.app === app.id)
      : undefined;

    if ((!existing && leaves(app, app.home)) || !fits(profile, direction)) {
      return;
    }

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
        log(`Refused to open ${appId}, which New tab does not list`);

        return;
      }

      if (open.split) {
        await chooseForSplit(profile, app, open.split);

        return;
      }

      overlays.close();

      if (!leaves(app, app.home)) {
        await openTab(open.profileId, app, app.home);
      }
    },
    /** Opens a bookmark the open launcher lists, and closes it. */
    chooseBookmark: async (id: string) => {
      const open = current();
      const profile =
        open &&
        state().profiles.find(
          ({ id: candidate }) => candidate === open.profileId
        );
      const choice =
        profile && chooseBookmark(state(), profile.id, id, pageUrl);
      const app = choice && findApp(apps, choice.bookmark.app);

      if (!open || !profile || !choice || !app) {
        log("Refused to open a bookmark the open launcher does not list");

        return;
      }

      overlays.close();

      if (
        (open.split !== undefined || choice.kind !== "select") &&
        leaves(app, choice.bookmark.url)
      ) {
        return;
      }

      if (open.split) {
        if (fits(profile, open.split)) {
          await openTab(
            profile.id,
            app,
            choice.bookmark.url,
            undefined,
            open.split
          );
        }
      } else if (choice.kind === "select") {
        if (choice.ownWindow) {
          showOwnWindow(choice.key);
        } else {
          await selectTab(choice.key);
        }
      } else {
        await openTab(profile.id, app, choice.bookmark.url);
      }
    },
    /** Removes a bookmark the open launcher lists, which stays open. */
    removeBookmark: async (id: string) => {
      const open = current();

      if (!open) {
        log("Refused to remove a bookmark with no launcher open");

        return;
      }

      await removeBookmark(open.profileId, id);
    },
  };
};

export type OpenApp = ReturnType<typeof createOpenApp>;
