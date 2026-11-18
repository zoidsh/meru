import { findApp } from "#core/apps.ts";
import type { App } from "#core/apps.ts";
import { isPinned } from "#core/state.ts";
import type { State } from "#core/state.ts";
import { duplicatePlace, tabMenuAt, tabMenuItems } from "#core/tab-menu.ts";
import type { TabMenuItemId, TabMenuRequest } from "#core/tab-menu.ts";
import { findTab } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import type { Size } from "#core/window-bounds.ts";
import type { Clipboard } from "#platform/clipboard.ts";
import type { SystemBrowser } from "#platform/system-browser.ts";

import type { Overlays } from "./overlay.ts";
import type { Profiles } from "./profiles.ts";

export interface TabMenuDeps {
  state: () => State;
  /** The registry, or the suite's stand-ins for it. */
  apps: readonly App[];
  /** The window's content area, which a menu's point must lie in. */
  contentSize: () => Size;
  overlays: Pick<Overlays, "open" | "close" | "current">;
  profiles: Pick<
    Profiles,
    | "setPinned"
    | "setOpenAtLaunch"
    | "closeTab"
    | "closeOtherTabs"
    | "closeTabsBelow"
  >;
  /** Whether the tab has a page, which Reload needs. */
  isLoaded: (key: TabKey) => boolean;
  reload: (key: TabKey) => void;
  /** Opens `url` as a new tab of `app`, selected, after the tab `after` names. */
  openTab: (
    profileId: string,
    app: App,
    url: string,
    after?: string
  ) => Promise<unknown>;
  clipboard: Clipboard;
  systemBrowser: SystemBrowser;
  log: (message: string) => void;
}

const isWebUrl = (url: string) => {
  try {
    const { protocol } = new URL(url);

    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
};

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * A tab's context menu, drawn by the shell in the overlay's view: opened at
 * the point the shell names for a tab that is shown, and each item run on
 * that tab, which need not be the selected one and is not selected by it.
 */
export const createTabMenu = ({
  state,
  apps,
  contentSize,
  overlays,
  profiles,
  isLoaded,
  reload,
  openTab,
  clipboard,
  systemBrowser,
  log,
}: TabMenuDeps) => {
  const act = async (item: TabMenuItemId, key: TabKey) => {
    const tab = findTab(state(), key);

    if (!tab) {
      return;
    }

    switch (item) {
      case "reload": {
        reload(key);
        break;
      }
      case "duplicate": {
        const app = findApp(apps, tab.app);

        if (app) {
          await openTab(key.profileId, app, tab.url, duplicatePlace(tab));
        }

        break;
      }
      case "copyUrl": {
        await clipboard.writeText(tab.url);
        break;
      }
      case "openInBrowser": {
        if (isWebUrl(tab.url)) {
          await systemBrowser.open(tab.url);
        } else {
          log("Refused to open a tab's page that is not on the web outside");
        }

        break;
      }
      case "pin": {
        await profiles.setPinned(key, !isPinned(tab));
        break;
      }
      case "openAtLaunch": {
        await profiles.setOpenAtLaunch(key, tab.openAtLaunch !== true);
        break;
      }
      case "close": {
        await profiles.closeTab(key);
        break;
      }
      case "closeOthers": {
        await profiles.closeOtherTabs(key);
        break;
      }
      default: {
        await profiles.closeTabsBelow(key);
      }
    }
  };

  return {
    open: (request: TabMenuRequest) => {
      const at = tabMenuAt(state(), request, contentSize());

      if (!at) {
        log(
          `Refused a menu for tab ${request.profileId}/${request.tabId} at ${request.x},${request.y}`
        );

        return;
      }

      overlays.open({ kind: "tab-menu", ...at });
    },
    /** Runs the item on the open menu's tab, if the menu offers it, and closes it. */
    run: async (item: TabMenuItemId) => {
      const open = overlays.current();

      if (open?.kind !== "tab-menu") {
        log(`Refused the tab menu's ${item} with no tab menu open`);

        return;
      }

      const key = { profileId: open.profileId, tabId: open.tabId };
      const offered = tabMenuItems(state(), key, apps, isLoaded(key))?.find(
        (candidate) => candidate.id === item
      );

      try {
        if (offered?.enabled) {
          await act(item, key);
        } else {
          log(`Refused the tab menu's ${item}, which it does not offer`);
        }
      } catch (error) {
        log(`The tab menu's ${item} failed: ${describe(error)}`);
      } finally {
        overlays.close();
      }
    },
  };
};

export type TabMenu = ReturnType<typeof createTabMenu>;
