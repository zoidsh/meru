import type { App, AppOpening } from "#core/apps.ts";
import { scrub } from "#core/log.ts";
import type { Log } from "#core/log.ts";
import type { TabKey } from "#core/tabs.ts";
import { allowsChildNavigation, routeWindowOpen } from "#core/window-open.ts";
import type { WindowOpenRoute } from "#core/window-open.ts";
import type { WindowOpenAnswer } from "#platform/content-view.ts";
import type { SystemBrowser } from "#platform/system-browser.ts";

/** How long after a page's request to add an account another is dropped. */
const ADD_PROFILE_PAUSE_MS = 1000;

/**
 * Where a window a tab's page opens goes, and where a link a child window
 * follows out of its app goes instead: the system browser, a tab of the
 * profile, a new profile for another account, a download, or nowhere.
 */
export const createWindowOpenRouting = ({
  apps,
  appOpening,
  signInOrigins,
  systemBrowser,
  openerApp,
  openAsTab,
  addProfile,
  log,
}: {
  /** The apps a link may open a tab of, as they are now. */
  apps: () => readonly App[];
  /** Tabs & Google Apps' settings as they are now, for the profile. */
  appOpening: (profileId: string) => AppOpening;
  signInOrigins: readonly string[];
  systemBrowser: SystemBrowser;
  /** The app of the tab whose page asks, or "" once it is gone. */
  openerApp: (key: TabKey) => string;
  /** Opens `url` as a tab of `app`, from the page of the tab `from`. */
  openAsTab: (from: TabKey, app: App, url: string) => Promise<void>;
  addProfile: () => Promise<unknown>;
  log: Log;
}) => {
  const openInSystemBrowser = async (url: string) => {
    try {
      await systemBrowser.open(url);
    } catch (error) {
      log("system-browser-open-failed", { code: scrub.code(error) });
    }
  };

  /** A page can ask for many at once and needs no click to ask. */
  let addingProfile = false;

  const addProfileFromPage = async () => {
    if (addingProfile) {
      log("add-account-dropped", { reason: "repeated" });

      return;
    }

    addingProfile = true;

    try {
      await addProfile();
    } catch (error) {
      log("add-account-failed", { error: scrub.error(error) });
    } finally {
      setTimeout(() => {
        addingProfile = false;
      }, ADD_PROFILE_PAUSE_MS);
    }
  };

  const follow = (route: WindowOpenRoute, url: string, from: TabKey) => {
    switch (route.kind) {
      case "system-browser": {
        openInSystemBrowser(route.url);
        break;
      }
      case "tab": {
        openAsTab(from, route.app, url);
        break;
      }
      case "add-profile": {
        addProfileFromPage();
        break;
      }
      case "deny": {
        log("window-open-refused", { url: scrub.host(url) });
        break;
      }
      default: {
        break;
      }
    }
  };

  const opening = (tabKeyed: TabKey) => ({
    signInOrigins,
    apps: apps(),
    openerApp: openerApp(tabKeyed),
    opening: appOpening(tabKeyed.profileId),
  });

  return {
    onWindowOpen: (
      tabKeyed: TabKey,
      url: string,
      asked?: { inBackground: boolean }
    ): WindowOpenAnswer => {
      const route = routeWindowOpen(url, opening(tabKeyed), asked);

      follow(route, url, tabKeyed);

      if (route.kind === "child-window") {
        return "allow";
      }

      return route.kind === "download" ? "download" : "deny";
    },
    onChildNavigation: (tabKeyed: TabKey, url: string) => {
      if (allowsChildNavigation(url, opening(tabKeyed))) {
        return "allow";
      }

      const route = routeWindowOpen(url, opening(tabKeyed));

      log("window-open-kept", { url: scrub.host(url) });

      if (
        route.kind !== "child-window" &&
        route.kind !== "download" &&
        route.kind !== "deny"
      ) {
        follow(route, url, tabKeyed);
      }

      return "deny";
    },
  };
};
