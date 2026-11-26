import { t } from "@lingui/core/macro";

import { findApp } from "#core/apps.ts";
import type { App } from "#core/apps.ts";
import { menuItem, menuPointInside } from "#core/context-menu.ts";
import type { MenuEntry } from "#core/context-menu.ts";
import { marksSleepWhenIdle } from "#core/idle-sleep.ts";
import type { PaneDirection } from "#core/pane-tree.ts";
import type { SleepIdleTabs } from "#core/settings.ts";
import type { State } from "#core/state.ts";
import {
  duplicatePlace,
  ownWindowMenu,
  tabMenu,
  tabMenuAt,
} from "#core/tab-menu.ts";
import type { TabMenuItemId, TabMenuRequest } from "#core/tab-menu.ts";
import { findTab } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import type { PlainWindow } from "#platform/base-window.ts";
import type { Clipboard } from "#platform/clipboard.ts";
import type { SystemBrowser } from "#platform/system-browser.ts";

import type { Bookmarks } from "./bookmarks.ts";
import { nativeMenu } from "./context-menu.ts";
import { MENU_LABELS } from "./menu-labels.ts";
import type { Profiles } from "./profiles.ts";

type MenuWindow = Pick<PlainWindow, "showContextMenu" | "getContentAreaSize">;

export interface TabMenuDeps {
  state: () => State;
  /** The registry, or the suite's stand-ins for it. */
  apps: readonly App[];
  /** The main window, whose sidebar asks for a tab's menu. */
  window: MenuWindow;
  /** The tab's own window while it is open, whose titlebar has More options. */
  ownWindow: (key: TabKey) => MenuWindow | undefined;
  /** The shortcut the registry gives a command on this platform, if any. */
  accelerator: (command: string) => string | undefined;
  bookmarks: Pick<Bookmarks, "bookmarked" | "toggle">;
  profiles: Pick<
    Profiles,
    | "setPinned"
    | "setOpenAtLaunch"
    | "setSleepWhenIdle"
    | "closeTab"
    | "closeOtherTabs"
    | "closeTabsBelow"
    | "separateTab"
    | "maximizePane"
  >;
  /** Moves the tab to its own window and brings that forward. */
  moveToOwnWindow: (key: TabKey) => Promise<unknown>;
  /** Puts the tab back in the main window, selected. */
  moveToMainWindow: (key: TabKey) => Promise<unknown>;
  /** Opens Open in split beside or below the selected tab's pane. */
  openSplit: (direction: PaneDirection) => void;
  /** Whether the tab has a page, else it sleeps. */
  isLoaded: (key: TabKey) => boolean;
  /** Which tabs sleep once idle, as the setting is now. */
  sleepIdleTabs: () => SleepIdleTabs;
  /**
   * The URL the tab's page shows now, where it has a live one: the saved
   * URL is written at most once a second, so it can lag behind.
   */
  pageUrl: (key: TabKey) => string | undefined;
  /** Loads the tab's page again, or wakes and selects it where it sleeps. */
  reload: (key: TabKey) => Promise<unknown>;
  sleep: (key: TabKey) => void;
  /** Wakes the tab and selects it. */
  wake: (key: TabKey) => Promise<unknown>;
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

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Each item's label, in the person's language as it is when called. */
const LABELS: Record<TabMenuItemId, () => string> = {
  sleep: () =>
    t({
      message: "Sleep",
      comment:
        "Item of a tab's context menu that frees its page until it is woken, keeping its place",
    }),
  wake: () =>
    t({
      message: "Wake",
      comment:
        "Item of a sleeping tab's context menu, in place of Sleep, that loads its page again and selects it",
    }),
  sleepWhenIdle: () =>
    t({
      message: "Sleep When Idle",
      comment:
        "Checkbox item of a tab's context menu, shown while Settings' Sleep idle tabs is Tabs you choose, that has this tab sleep by itself once it has gone unused for the time Settings sets",
    }),
  reload: MENU_LABELS.reload,
  duplicate: () =>
    t({
      message: "Duplicate",
      comment:
        "Item of a tab's context menu that opens another tab of the same Google app at the same page",
    }),
  copyUrl: () =>
    t({
      message: "Copy URL",
      comment: "Item of a tab's context menu that copies its page's address",
    }),
  openInBrowser: () =>
    t({
      message: "Open in Default Browser",
      comment:
        "Item of a tab's context menu that opens its page in the system's web browser",
    }),
  pin: () =>
    t({
      message: "Pin",
      comment:
        "Item of a tab's context menu that pins it to the top of the sidebar, which keeps it from closing",
    }),
  unpin: () =>
    t({
      message: "Unpin",
      comment:
        "Item of a pinned tab's context menu that unpins it, so it can close",
    }),
  openAtLaunch: MENU_LABELS.openAtLaunch,
  bookmark: MENU_LABELS.bookmarkTab,
  removeBookmark: MENU_LABELS.removeBookmark,
  splitRight: MENU_LABELS.splitRight,
  splitDown: MENU_LABELS.splitDown,
  maximize: MENU_LABELS.maximizePane,
  restore: MENU_LABELS.restorePanes,
  separate: MENU_LABELS.separateFromSplit,
  moveToNewWindow: MENU_LABELS.moveToNewWindow,
  moveToMainWindow: MENU_LABELS.moveToMainWindow,
  close: MENU_LABELS.closeTab,
  closeOthers: () =>
    t({
      message: "Close Other Tabs",
      comment:
        "Item of a tab's context menu that closes every other tab of the profile but pinned ones",
    }),
  closeBelow: () =>
    t({
      message: "Close Tabs Below",
      comment:
        "Item of a tab's context menu that closes the tabs below it in the sidebar but pinned ones",
    }),
};

const label = (id: TabMenuItemId) => LABELS[id]();

/**
 * A tab's context menu, from its row or tile in the main window's sidebar,
 * and More options in its own window's titlebar: native menus popped up at
 * the point the shell names, for a tab that is shown, each item run on that
 * tab, which need not be the selected one and is not selected by it. An item
 * runs only if the menu offers it, enabled, when it is chosen.
 */
export const createTabMenu = ({
  state,
  apps,
  window,
  ownWindow,
  accelerator,
  bookmarks,
  profiles,
  moveToOwnWindow,
  moveToMainWindow,
  isLoaded,
  sleepIdleTabs,
  pageUrl,
  reload,
  sleep,
  wake,
  openTab,
  openSplit,
  clipboard,
  systemBrowser,
  log,
}: TabMenuDeps) => {
  const split = async (key: TabKey, direction: "row" | "column") => {
    // Beside this tab, which selecting focuses.
    await wake(key);
    openSplit(direction);
  };

  /**
   * Starts an item that changes where the tab's page shows, in a split or a
   * window of its own, or gives nothing for any other item. It gives the
   * promise rather than awaiting it so the other items start in the same
   * turn, as the one-at-a-time guard expects.
   */
  const placeTab = (item: TabMenuItemId, key: TabKey) => {
    switch (item) {
      case "splitRight":
      case "splitDown": {
        return split(key, item === "splitRight" ? "row" : "column");
      }
      case "separate": {
        return profiles.separateTab(key);
      }
      case "maximize":
      case "restore": {
        return profiles.maximizePane(key, item === "maximize");
      }
      case "moveToNewWindow": {
        return moveToOwnWindow(key);
      }
      case "moveToMainWindow": {
        return moveToMainWindow(key);
      }
      default: {
        return null;
      }
    }
  };

  const act = async (item: TabMenuItemId, key: TabKey) => {
    const tab = findTab(state(), key);

    if (!tab) {
      return;
    }

    const placing = placeTab(item, key);
    const url = pageUrl(key) ?? tab.url;

    if (placing) {
      await placing;

      return;
    }

    switch (item) {
      case "sleep": {
        sleep(key);
        break;
      }
      case "wake": {
        await wake(key);
        break;
      }
      case "reload": {
        await reload(key);
        break;
      }
      case "duplicate": {
        const app = findApp(apps, tab.app);

        if (app) {
          await openTab(key.profileId, app, url, duplicatePlace(tab));
        }

        break;
      }
      case "copyUrl": {
        await clipboard.writeText(url);
        break;
      }
      case "openInBrowser": {
        await systemBrowser.open(url);
        break;
      }
      case "pin":
      case "unpin": {
        await profiles.setPinned(key, item === "pin");
        break;
      }
      case "bookmark":
      case "removeBookmark": {
        await bookmarks.toggle(key, true);
        break;
      }
      case "openAtLaunch": {
        await profiles.setOpenAtLaunch(key, tab.openAtLaunch !== true);
        break;
      }
      case "sleepWhenIdle": {
        await profiles.setSleepWhenIdle(key, !marksSleepWhenIdle(tab));
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

  const menuOf = (key: TabKey) =>
    tabMenu(
      state(),
      key,
      apps,
      {
        loaded: isLoaded(key),
        url: pageUrl(key),
        bookmarked: bookmarks.bookmarked(key),
      },
      sleepIdleTabs()
    );

  /** Runs the item if the menu `current` gives now still offers it, enabled. */
  const choose = async <Id extends TabMenuItemId>(
    current: () => readonly MenuEntry<Id>[] | undefined,
    item: Id,
    key: TabKey
  ) => {
    try {
      if (menuItem(current(), item)?.enabled) {
        await act(item, key);
      } else {
        log(`Refused the tab menu's ${item}, which it does not offer`);
      }
    } catch (error) {
      log(`The tab menu's ${item} failed: ${describe(error)}`);
    }
  };

  const popup = <Id extends TabMenuItemId>(
    target: MenuWindow,
    current: () => readonly MenuEntry<Id>[] | undefined,
    request: TabMenuRequest
  ) => {
    const key = { profileId: request.profileId, tabId: request.tabId };
    const entries = current();

    if (!entries) {
      return;
    }

    target.showContextMenu(
      nativeMenu(entries, {
        label,
        accelerator,
        choose: (item) => choose(current, item, key),
      }),
      { x: request.x, y: request.y }
    );
  };

  const refuse = (request: TabMenuRequest) => {
    log(
      `Refused a menu for tab ${request.profileId}/${request.tabId} at ${request.x},${request.y}`
    );
  };

  return {
    /** The tab's menu, from the main window's sidebar. */
    open: (request: TabMenuRequest) => {
      const at = tabMenuAt(state(), request, window.getContentAreaSize());

      if (!at) {
        refuse(request);

        return;
      }

      popup(window, () => menuOf(at), at);
    },
    /** More options, from the titlebar of the tab's own window. */
    openOwnWindow: (request: TabMenuRequest) => {
      const key = { profileId: request.profileId, tabId: request.tabId };
      const target = ownWindow(key);

      if (
        !target ||
        !ownWindowMenu(state(), key) ||
        !menuPointInside(request, target.getContentAreaSize())
      ) {
        refuse(request);

        return;
      }

      popup(target, () => ownWindowMenu(state(), key, pageUrl(key)), request);
    },
  };
};

export type TabMenu = ReturnType<typeof createTabMenu>;
